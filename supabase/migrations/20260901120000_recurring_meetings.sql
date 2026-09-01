-- =============================================================================
-- File:        supabase/migrations/20260901120000_recurring_meetings.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Weekly recurring study sessions.
--
--              OCCURRENCES ARE REAL ROWS, NOT A RULE EVALUATED AT READ TIME.
--              This is the decision the whole feature turns on. Every invariant
--              in the scheduler is already defined on `meetings`: the clash
--              trigger intersects tstzranges over meeting_attendees, the slot
--              RPC subtracts booked meetings from the intersection, my_schedule
--              reads them, the chat feed shows them, the freeze trigger and the
--              rating rule in 7D both key on one. A virtual occurrence would
--              have to teach every one of those about recurrence rules — the
--              scheduling core rewritten so a checkbox can exist. Materialising
--              instead makes recurrence a BOOKING-TIME concept, and the entire
--              downstream stays exactly as it was: a repeated session blocks its
--              slot, refuses a double booking and can be RSVPed to because it is
--              the same kind of row as any other.
--
--              "UNTIL CANCELLED" IS A ROLLING HORIZON, because rows are finite.
--              A series materialises SERIES_HORIZON_WEEKS ahead and a nightly
--              job tops it back up, so there is always at least that much booked
--              in front of the students. The horizon is well beyond every read
--              surface in the product — the picker looks two weeks ahead and the
--              dashboard thirty days — so nobody can see the edge of it.
--
--              A CLASH SKIPS ONE WEEK, IT DOES NOT FAIL THE BOOKING. The rest of
--              this schema is deliberately all-or-nothing, and here that would be
--              wrong: "you cannot study every Tuesday because you have something
--              on in three weeks' time" is a refusal nobody would accept from a
--              calendar. The FIRST occurrence is still mandatory — that one is
--              the booking the student is actually making, and a silent failure
--              there would be a lie — and every later week is best effort.
-- Version:     0.53.0
--
-- Modifications:
--     0.53.0 - 2026-09-01 - Initial implementation (recurring meetings)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The rule
-- -----------------------------------------------------------------------------

create type meeting_frequency as enum ('weekly');

comment on type meeting_frequency is
  'How often a series repeats. One value today; the column exists so adding fortnightly later is a new enum label rather than a new table.';

create type meeting_series_status as enum ('active', 'cancelled');

create table meeting_series (
  id                 uuid primary key default gen_random_uuid(),
  -- Denormalised for the same reason meetings does it: tenancy is checked on
  -- every read and must not need a join.
  university_id      uuid not null references universities (id) on delete cascade,

  -- Exactly one, matching meetings. A series belongs to the chat it was booked
  -- from, and that is where its occurrences appear.
  conversation_id    uuid references conversations (id) on delete cascade,
  group_id           uuid references study_groups (id) on delete cascade,

  course_offering_id uuid references course_offerings (id) on delete set null,
  created_by         uuid references profiles (id) on delete set null,

  frequency          meeting_frequency not null default 'weekly',

  -- The first occurrence, and the anchor every later one is measured from. Kept
  -- as timestamptz rather than a weekday plus a time: the occurrences are real
  -- instants, and re-deriving them from a wall clock is how a series drifts an
  -- hour at a daylight-saving boundary.
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,

  title              text not null check (char_length(btrim(title)) between 3 and 120),
  location           text check (char_length(btrim(location)) <= 200),

  status             meeting_series_status not null default 'active',
  -- How far ahead occurrences have actually been written. The nightly job reads
  -- this, so a series that was booked while the job was down catches up rather
  -- than starting from its anchor every night.
  booked_through     timestamptz not null,

  created_at         timestamptz not null default now(),
  cancelled_at       timestamptz,
  cancelled_by       uuid references profiles (id) on delete set null,

  constraint meeting_series_one_scope check (num_nonnulls(conversation_id, group_id) = 1),
  constraint meeting_series_ordered   check (ends_at > starts_at),
  constraint meeting_series_bounded   check (ends_at <= starts_at + interval '8 hours'),
  constraint meeting_series_cancelled_is_stamped
    check ((status = 'cancelled') = (cancelled_at is not null))
);

comment on table meeting_series is
  'A repeating study session. Holds the rule; the occurrences are ordinary rows in meetings, each carrying series_id. Cancelling the series stops future occurrences and leaves the past ones as the record of what happened.';

comment on column meeting_series.booked_through is
  'The start of the last occurrence written so far. The top-up job resumes from here rather than from starts_at.';

-- The top-up job walks active series and nothing else.
create index meeting_series_active_idx
  on meeting_series (booked_through)
  where status = 'active';

alter table meetings
  -- set null rather than cascade: a series is never deleted in normal use, but
  -- if one ever is, the sessions still happened and the ratings in 7D depend on
  -- their rows surviving. Safe here because nothing guards UPDATE on meetings —
  -- the freeze trigger is on meeting_attendees.
  add column series_id uuid references meeting_series (id) on delete set null;

comment on column meetings.series_id is
  'Set when this session is one occurrence of a repeating series. Null for a one-off. The row is otherwise an ordinary meeting in every respect.';

-- "The occurrences of this series, soonest first" — cancellation and the top-up
-- job both walk exactly this.
create index meetings_series_starts_idx
  on meetings (series_id, starts_at)
  where series_id is not null;

alter table meeting_series enable row level security;

-- EXPLICIT, because RLS is not the only gate. A table with policies and no
-- table-level GRANT fails with 42501 and an error that says nothing about the
-- missing grant — the exact bug 20260818140000_calendar_service_role_grants.sql
-- exists to correct. Reads only: every write here goes through an RPC.
grant select on public.meeting_series to authenticated;

-- And the service role, explicitly. 20260803120900_grants.sql granted every
-- table that existed WHEN IT RAN, so a table added later has none — the nightly
-- top-up job and every integration test read this one.
grant all privileges on public.meeting_series to service_role;

-- Visible to the people who are in it, derived from the occurrences rather than
-- re-deriving membership: an attendee of any occurrence is in the series, which
-- is the same answer and one already-tested helper.
create policy "attendees can read their series"
  on public.meeting_series for select to authenticated
  using (
    exists (
      select 1
      from public.meetings m
      where m.series_id = meeting_series.id
        and public.app_is_meeting_attendee(m.id)
    )
  );

-- -----------------------------------------------------------------------------
-- 2. Materialising one occurrence
-- -----------------------------------------------------------------------------

-- How far ahead a series is kept booked.
--
-- Eight weeks is comfortably past every surface that reads meetings — the picker
-- looks two weeks ahead, the dashboard thirty days — so a student never sees the
-- end of the series, and it is small enough that a year of active series is
-- thousands of rows rather than millions.
create or replace function public.app_series_horizon_weeks()
returns int
language sql
immutable
set search_path = ''
as $$ select 8 $$;

-- Write one occurrence of a series, or decline to.
--
-- NOT SECURITY-CHECKED, AND CALLED FROM TWO PLACES THAT CHECK DIFFERENTLY.
-- rpc_create_meeting_series authorises the caller against the chat before it
-- ever gets here; the nightly job has no caller at all, and authorising against
-- auth.uid() would make it fail on every row. So the authorisation lives at the
-- entry points and this function is internal: revoked from public and from
-- authenticated below.
--
-- THE CLASH IS CAUGHT, NOT RAISED. A week where somebody has since booked
-- something else is skipped and reported as a null, which is what lets a series
-- survive one busy Tuesday instead of refusing to exist.
--
-- @param p_series_id - The series this occurrence belongs to.
-- @param p_starts_at - When it starts.
-- @param p_ends_at   - When it ends.
-- @returns The new meeting's id, or null when the week was already taken.
create or replace function public.app_materialise_series_occurrence(
  p_series_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series       public.meeting_series%rowtype;
  v_participants uuid[];
  v_participant  uuid;
  v_meeting_id   uuid;
begin
  select * into v_series
  from public.meeting_series s
  where s.id = p_series_id
    and s.status = 'active';

  if v_series.id is null then
    return null;
  end if;

  if v_series.conversation_id is not null then
    select array[c.participant_a, c.participant_b]
    into v_participants
    from public.conversations c
    where c.id = v_series.conversation_id;
  else
    -- Whoever is in the group NOW. A member who joined last week is on next
    -- week's session, which is the same rule new_members_join_upcoming_sessions
    -- established for one-off bookings.
    select array_agg(m.profile_id order by m.profile_id)
    into v_participants
    from public.study_group_members m
    where m.group_id = v_series.group_id;
  end if;

  if v_participants is null or cardinality(v_participants) < 2 then
    return null;
  end if;

  -- Sorted, to make the lock order total across concurrent bookings. Identical
  -- to rpc_create_meeting, and it has to be: two orders is a deadlock.
  foreach v_participant in array (select array_agg(p order by p) from unnest(v_participants) p)
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_participant::text, 0));
  end loop;

  begin
    insert into public.meetings (
      university_id, conversation_id, group_id, course_offering_id,
      created_by, title, location, starts_at, ends_at, series_id
    )
    values (
      v_series.university_id, v_series.conversation_id, v_series.group_id,
      v_series.course_offering_id, v_series.created_by, v_series.title,
      v_series.location, p_starts_at, p_ends_at, v_series.id
    )
    returning id into v_meeting_id;

    -- The clash trigger fires per row and rolls back to the block's savepoint,
    -- taking the meeting row with it. Nobody is left half-invited.
    insert into public.meeting_attendees (meeting_id, profile_id, rsvp, responded_at)
    select v_meeting_id, p, 'going', case when p = v_series.created_by then now() end
    from unnest(v_participants) p;
  exception
    -- 23505 is what check_meeting_no_clash raises. Anything else is a real
    -- fault and belongs upstairs.
    when unique_violation then
      return null;
  end;

  return v_meeting_id;
end;
$$;

comment on function public.app_materialise_series_occurrence is
  'Writes one occurrence of a series and invites the chat to it, returning null when that week clashes with something already in somebody''s diary. Internal: the entry points authorise, this does not.';

revoke execute on function public.app_materialise_series_occurrence(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.app_materialise_series_occurrence(uuid, timestamptz, timestamptz) from authenticated;

-- Fill a series forward to the horizon.
--
-- Idempotent, and safe to run at any time: it resumes from booked_through and
-- writes only weeks that are not there yet.
--
-- @param p_series_id - The series to extend.
-- @returns How many occurrences were written.
create or replace function public.app_extend_series(p_series_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series   public.meeting_series%rowtype;
  v_horizon  timestamptz;
  v_starts   timestamptz;
  v_length   interval;
  v_created  uuid;
  v_written  int := 0;
begin
  select * into v_series
  from public.meeting_series s
  where s.id = p_series_id
    and s.status = 'active'
  for update;

  if v_series.id is null then
    return 0;
  end if;

  v_horizon := now() + (public.app_series_horizon_weeks() * interval '1 week');
  v_length  := v_series.ends_at - v_series.starts_at;
  v_starts  := v_series.booked_through + interval '1 week';

  while v_starts <= v_horizon loop
    -- A skipped week still counts as covered. Retrying it every night would
    -- fail every night for as long as the other booking stands.
    --
    -- The return value, not FOUND: after PERFORM of a function call FOUND is
    -- true whether the function returned a row or a null, so counting on it
    -- would report every skipped week as written.
    v_created := public.app_materialise_series_occurrence(
      v_series.id, v_starts, v_starts + v_length
    );

    if v_created is not null then
      v_written := v_written + 1;
    end if;

    v_starts := v_starts + interval '1 week';
  end loop;

  update public.meeting_series
  set booked_through = greatest(booked_through, v_starts - interval '1 week')
  where id = v_series.id;

  return v_written;
end;
$$;

comment on function public.app_extend_series is
  'Books a series forward to the horizon, skipping weeks that clash. Resumes from booked_through, so it is idempotent and safe on a timer.';

revoke execute on function public.app_extend_series(uuid) from public;
revoke execute on function public.app_extend_series(uuid) from authenticated;

-- -----------------------------------------------------------------------------
-- 3. Booking a series
-- -----------------------------------------------------------------------------

-- Book one or more repeating sessions, weekly until cancelled.
--
-- The sibling of rpc_create_meetings, and deliberately a separate function
-- rather than a flag on that one: PostgREST resolves an overload from the
-- argument names it is sent, so adding a defaulted parameter to a function the
-- app already calls makes both candidates match and the call ambiguous.
--
-- ALL OR NOTHING ACROSS THE SELECTION, best-effort within each series. If the
-- student picked Tuesday and Thursday and Thursday's first session clashes,
-- nothing is booked and they are told — the same contract rpc_create_meetings
-- has. Once a series exists, a later week that clashes is skipped instead.
--
-- @param p_title           - What the sessions are for.
-- @param p_starts_at       - One start per series.
-- @param p_ends_at         - The matching ends.
-- @param p_conversation_id - The one-to-one chat, or null.
-- @param p_group_id        - The group chat, or null.
-- @param p_location        - Where, optionally.
-- @returns The id of each series created.
create or replace function public.rpc_create_meeting_series(
  p_title text,
  p_starts_at timestamptz[],
  p_ends_at timestamptz[],
  p_conversation_id uuid default null,
  p_group_id uuid default null,
  p_location text default null
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count        int;
  v_index        int;
  v_participants uuid[];
  v_university   uuid;
  v_offering     uuid;
  v_series_id    uuid;
  v_series_ids   uuid[] := '{}';
  v_first        uuid;
begin
  if (p_conversation_id is null) = (p_group_id is null) then
    raise exception 'Name exactly one of a conversation or a group.'
      using errcode = '22023';
  end if;

  v_count := coalesce(array_length(p_starts_at, 1), 0);

  if v_count = 0 then
    raise exception 'Pick at least one time.'
      using errcode = '22023';
  end if;

  if v_count <> coalesce(array_length(p_ends_at, 1), 0) then
    raise exception 'Every session needs both a start and an end.'
      using errcode = '22023';
  end if;

  -- Lower than the twenty rpc_create_meetings allows, and on purpose: each of
  -- these is eight weeks of rows, not one.
  if v_count > 5 then
    raise exception 'That is more repeating sessions than can be booked at once.'
      using errcode = '22023';
  end if;

  -- The same membership check rpc_create_meeting makes, made once here because
  -- the occurrences below are written by an internal function that does not.
  if p_conversation_id is not null then
    select array[c.participant_a, c.participant_b], c.university_id, c.course_offering_id
    into v_participants, v_university, v_offering
    from public.conversations c
    where c.id = p_conversation_id
      and auth.uid() in (c.participant_a, c.participant_b);
  else
    select array_agg(m.profile_id order by m.profile_id), max(g.university_id::text)::uuid,
           max(g.course_offering_id::text)::uuid
    into v_participants, v_university, v_offering
    from public.study_group_members m
    join public.study_groups g on g.id = m.group_id
    where m.group_id = p_group_id
      and exists (
        select 1
        from public.study_group_members me
        where me.group_id = p_group_id
          and me.profile_id = auth.uid()
      );
  end if;

  if v_participants is null or cardinality(v_participants) < 2 then
    raise exception 'That chat is not yours, or has nobody else in it.'
      using errcode = '42501';
  end if;

  for v_index in 1 .. v_count loop
    insert into public.meeting_series (
      university_id, conversation_id, group_id, course_offering_id, created_by,
      title, location, starts_at, ends_at, booked_through
    )
    values (
      v_university, p_conversation_id, p_group_id, v_offering, auth.uid(),
      btrim(p_title), nullif(btrim(coalesce(p_location, '')), ''),
      p_starts_at[v_index], p_ends_at[v_index], p_starts_at[v_index]
    )
    returning id into v_series_id;

    -- The first occurrence is the booking the student is actually making. A
    -- clash here is the answer to their question and has to be raised.
    v_first := public.app_materialise_series_occurrence(
      v_series_id, p_starts_at[v_index], p_ends_at[v_index]
    );

    if v_first is null then
      raise exception 'That clashes with another meeting already in the diary.'
        using errcode = '23505';
    end if;

    perform public.app_extend_series(v_series_id);

    v_series_ids := v_series_ids || v_series_id;
  end loop;

  return v_series_ids;
end;
$$;

comment on function public.rpc_create_meeting_series is
  'Books repeating weekly sessions from a chat. Each selection becomes a series plus its occurrences to the horizon; a clash on the first week fails the whole booking, a clash on a later week skips that week.';

revoke execute on function public.rpc_create_meeting_series(text, timestamptz[], timestamptz[], uuid, uuid, text) from public;
grant execute on function public.rpc_create_meeting_series(text, timestamptz[], timestamptz[], uuid, uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Cancelling the rest of a series
-- -----------------------------------------------------------------------------

-- Call off every session in a series that has not started yet.
--
-- FROM NOW ON, NOT ALL OF IT. The occurrences already behind us are the record
-- that those sessions happened, and the rating rule in 7D reads them. Cancelling
-- a Tuesday series in March must not erase February.
--
-- Restricted to the organiser, exactly as rpc_cancel_meeting is: one person who
-- cannot make Tuesdays any more steps out with their own rsvp, which is a
-- different act from the series not happening.
--
-- @param p_meeting_id - Any occurrence of the series, usually the one on screen.
-- @returns How many future sessions were called off.
create or replace function public.rpc_cancel_meeting_series(p_meeting_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series_id uuid;
  v_cancelled int;
begin
  select m.series_id into v_series_id
  from public.meetings m
  join public.meeting_series s on s.id = m.series_id
  where m.id = p_meeting_id
    and s.status = 'active'
    and s.created_by = auth.uid();

  if v_series_id is null then
    raise exception 'That series is not yours to cancel, or is already cancelled.'
      using errcode = '42501';
  end if;

  update public.meeting_series
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid()
  where id = v_series_id;

  with stopped as (
    update public.meetings
    set status = 'cancelled',
        cancelled_at = now(),
        cancelled_by = auth.uid()
    where series_id = v_series_id
      and status = 'scheduled'
      -- Anything under way or over is history. Cancelling a session somebody is
      -- sitting in would take the rating with it.
      and starts_at > now()
    returning 1
  )
  select count(*)::int into v_cancelled from stopped;

  return v_cancelled;
end;
$$;

comment on function public.rpc_cancel_meeting_series is
  'Stops a repeating session from now on: the series and every future occurrence are cancelled, freeing those slots for everyone. Past occurrences are left alone.';

revoke execute on function public.rpc_cancel_meeting_series(uuid) from public;
grant execute on function public.rpc_cancel_meeting_series(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Keeping the horizon rolling
-- -----------------------------------------------------------------------------

-- Top every active series back up to the horizon.
--
-- @returns How many occurrences were written across all series.
create or replace function public.sync_meeting_series()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series  record;
  v_written int := 0;
begin
  for v_series in
    select id
    from public.meeting_series
    where status = 'active'
      and booked_through < now() + (public.app_series_horizon_weeks() * interval '1 week')
    order by booked_through
  loop
    v_written := v_written + public.app_extend_series(v_series.id);
  end loop;

  return v_written;
end;
$$;

comment on function public.sync_meeting_series is
  'Books every active series forward to the horizon. Idempotent, so it is safe on a timer and safe to run by hand.';

revoke execute on function public.sync_meeting_series() from public;
revoke execute on function public.sync_meeting_series() from authenticated;
grant execute on function public.sync_meeting_series() to service_role;

-- GUARDED, for the reason the session-prompt job gives: this migration has to
-- apply on a plain PostgreSQL too, and the function above is the valuable half.
-- Without pg_cron it simply goes unscheduled and any other timer can drive it.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    /* Replace rather than duplicate, so re-running is harmless. */
    perform cron.unschedule('studybuddy-meeting-series')
    where exists (
      select 1 from cron.job where jobname = 'studybuddy-meeting-series'
    );

    /*
     * Nightly, at 03:15. The horizon is eight weeks out, so this job is never
     * racing anybody: it has fifty-six days of slack to write next week's row,
     * and running it hourly would ask the same question twenty-four times for an
     * answer that changes once a week.
     */
    perform cron.schedule(
      'studybuddy-meeting-series',
      '15 3 * * *',
      $cron$select public.sync_meeting_series();$cron$
    );
  else
    raise notice 'pg_cron unavailable; sync_meeting_series created but not scheduled.';
  end if;
end;
$$;
