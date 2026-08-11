-- =============================================================================
-- File:        supabase/migrations/20260811120000_meetings.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Phase 7C — study sessions scheduled from a chat.
--
--              Closes design conflict C5, open since §8.4: the design showed
--              "Join Next Session" and the schema had nowhere to put a session.
--              It is also the answer to §15.6's last open item — "the rating
--              prompt is passive, because nothing knows a session happened".
--              After this migration, something does.
--
--              MEETINGS ARE NOT AVAILABILITY, and nothing here writes to
--              availability_slots. That table is a WEEKLY RECURRING TEMPLATE OF
--              FREE TIME: day_of_week, starts_at time, ends_at time, no date,
--              and every row in it means "free". A meeting is a single dated
--              interval, and it means the opposite. Writing meetings into it
--              would need a column it does not have and would invert the meaning
--              of a table app_overlap_minutes sums for 46 points of the match
--              score.
--
--              So BUSY IS DERIVED, never stored: a timeslot is blocked because a
--              meeting exists that the student is going to. Both readers agree
--              on that definition — rpc_meeting_slots subtracts it when offering
--              times, rpc_my_schedule reports it as the student's diary — and a
--              cancelled RSVP frees the slot everywhere at once because there was
--              never a second copy to clean up. Same call this schema already
--              makes for group fullness and for reputation.
--
--              WHY RSVPs ARE CANCELLED AND NEVER DELETED. Three requirements
--              need the row to survive: forfeiting the right to rate needs a
--              record that the student pulled out rather than an absence of
--              evidence; the other attendees should see who dropped; and the
--              freeze below needs something to freeze.
--
--              THE FREEZE IS THE LOAD-BEARING PART. rsvp cannot change once the
--              meeting has started. Without it the whole rating rule in 7D is
--              bypassable in three clicks: cancel, skip the session, then set
--              yourself back to 'going' afterwards and rate people you never met.
-- Version:     0.19.0
--
-- Modifications:
--     0.19.0 - 2026-08-11 - Initial schema (Phase 7C)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Where "Tuesday 18:00" is
-- -----------------------------------------------------------------------------

-- Weekly slots are `time` with no zone — local wall clock, on a week that starts
-- on Sunday because it is an Israeli academic week. A meeting is timestamptz.
-- Turning one into the other needs to know which local clock, and the answer
-- belongs to the campus: two students in one group must not disagree about when
-- their session is because one of them is travelling.
alter table universities
  add column timezone text not null default 'Asia/Jerusalem';

comment on column universities.timezone is
  'IANA zone the campus keeps. Projects the weekly availability grid onto real dates; deliberately not per-profile, so a group cannot disagree with itself about when it is meeting.';

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type meeting_status as enum ('scheduled', 'cancelled');

comment on type meeting_status is
  'cancelled means the whole session was called off. One person dropping out is an rsvp, not a status.';

create type meeting_rsvp as enum ('going', 'cancelled');

comment on type meeting_rsvp is
  'There is deliberately no "maybe": the timeslot is either blocked in your week or it is not, and a maybe would have to pick one anyway.';

-- -----------------------------------------------------------------------------
-- Meetings
-- -----------------------------------------------------------------------------

create table meetings (
  id                 uuid primary key default gen_random_uuid(),
  -- Denormalised, as on enrollments, conversations and study_groups: the tenancy
  -- check runs on every row read and must not need a join.
  university_id      uuid not null references universities (id) on delete cascade,

  -- Exactly one of these. A meeting belongs to the chat it was booked from, and
  -- the two chats are different tables because Phase 5 kept them apart.
  conversation_id    uuid references conversations (id) on delete cascade,
  group_id           uuid references study_groups (id) on delete cascade,

  -- What they are meeting about, when the chat knows. Nullable and `set null`:
  -- losing a course must not destroy the session's record.
  course_offering_id uuid references course_offerings (id) on delete set null,
  -- `set null` rather than cascade: the meeting happened, and the ratings in 7D
  -- depend on it having happened, even after its organiser leaves.
  created_by         uuid references profiles (id) on delete set null,

  title              text not null check (char_length(btrim(title)) between 3 and 120),
  location           text check (char_length(btrim(location)) <= 200),
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  status             meeting_status not null default 'scheduled',
  cancelled_at       timestamptz,
  cancelled_by       uuid references profiles (id) on delete set null,
  created_at         timestamptz not null default now(),

  constraint meetings_one_scope check (num_nonnulls(conversation_id, group_id) = 1),
  constraint meetings_ordered   check (ends_at > starts_at),
  -- A study session, not a residency. The bound is a guard against a typo in a
  -- date field, not a product opinion about how long people may work.
  constraint meetings_bounded   check (ends_at <= starts_at + interval '8 hours'),
  constraint meetings_cancelled_is_stamped
    check ((status = 'cancelled') = (cancelled_at is not null))
);

comment on table meetings is
  'A scheduled study session, booked from a one-to-one conversation or a group chat. The row IS the calendar block — nothing is written to availability_slots, which holds weekly free time and means the opposite.';

comment on column meetings.status is
  'Set to cancelled when the session itself is called off, which frees the slot for everyone. An individual dropping out sets their own meeting_attendees.rsvp instead.';

-- "The meetings in this chat, soonest first" — the chat header and the meeting
-- list. Two scopes, two indexes, each skipping the rows of the other.
create index meetings_group_starts_idx
  on meetings (group_id, starts_at)
  where group_id is not null;

create index meetings_conversation_starts_idx
  on meetings (conversation_id, starts_at)
  where conversation_id is not null;

-- -----------------------------------------------------------------------------
-- Who is going
-- -----------------------------------------------------------------------------

create table meeting_attendees (
  meeting_id   uuid not null references meetings (id) on delete cascade,
  profile_id   uuid not null references profiles (id) on delete cascade,
  rsvp         meeting_rsvp not null default 'going',
  responded_at timestamptz,
  created_at   timestamptz not null default now(),
  primary key (meeting_id, profile_id)
);

comment on table meeting_attendees is
  'One row per invited student, kept even after they cancel. The row is the evidence that they were in the session and stayed — which is exactly what the rating rule in Phase 7D checks.';

comment on column meeting_attendees.rsvp is
  'going blocks the timeslot in their schedule; cancelled frees it immediately. Frozen once the meeting has started, so attendance cannot be rewritten after the fact.';

-- "My meetings" is read on every schedule render and inside every intersection.
create index meeting_attendees_profile_idx
  on meeting_attendees (profile_id, rsvp);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Whether the caller was invited to this meeting.
--
-- SECURITY DEFINER for the same reason app_is_group_member is: it is called FROM
-- the meeting_attendees policy, and reading that table under RLS would re-enter
-- the policy and recurse.
create or replace function public.app_is_meeting_attendee(target_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.meeting_attendees a
    where a.meeting_id = target_meeting_id
      and a.profile_id = auth.uid()
  );
$$;

comment on function public.app_is_meeting_attendee is
  'True when the caller is on the invitation list, whatever they answered. Cancelling does not hide the meeting from them — they may still need to see what they pulled out of.';

revoke execute on function public.app_is_meeting_attendee(uuid) from public;
grant execute on function public.app_is_meeting_attendee(uuid) to authenticated;

-- The campus clock the weekly grid is written in.
create or replace function public.app_university_timezone(target_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(u.timezone, 'Asia/Jerusalem')
  from public.profiles p
  join public.universities u on u.id = p.university_id
  where p.id = target_profile_id;
$$;

revoke execute on function public.app_university_timezone(uuid) from public;
grant execute on function public.app_university_timezone(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Consistency
-- -----------------------------------------------------------------------------

-- A meeting cannot claim a chat it does not belong to, or start in the past.
--
-- The RPC checks these from the caller's side; this checks the row's own claims,
-- the same division check_study_group_consistency makes.
create or replace function public.check_meeting_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope_university uuid;
begin
  if new.conversation_id is not null then
    select c.university_id into v_scope_university
    from public.conversations c
    where c.id = new.conversation_id;
  else
    select g.university_id into v_scope_university
    from public.study_groups g
    where g.id = new.group_id;
  end if;

  if v_scope_university is null or v_scope_university <> new.university_id then
    raise exception 'A meeting must belong to a chat at its own university.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and new.starts_at <= now() then
    raise exception 'A meeting cannot be scheduled in the past.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger meetings_consistency
  before insert or update on public.meetings
  for each row execute function public.check_meeting_consistency();

-- An attendee has to be in the chat the meeting was booked from.
create or replace function public.check_meeting_attendee_belongs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conversation uuid;
  v_group        uuid;
begin
  select m.conversation_id, m.group_id
  into v_conversation, v_group
  from public.meetings m
  where m.id = new.meeting_id;

  if v_conversation is not null then
    if not exists (
      select 1
      from public.conversations c
      where c.id = v_conversation
        and new.profile_id in (c.participant_a, c.participant_b)
    ) then
      raise exception 'Only the two people in a conversation can attend its meeting.'
        using errcode = '23514';
    end if;
  else
    if not exists (
      select 1
      from public.study_group_members mem
      where mem.group_id = v_group
        and mem.profile_id = new.profile_id
    ) then
      raise exception 'Only members of the group can attend its meeting.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger meeting_attendees_belong
  before insert on public.meeting_attendees
  for each row execute function public.check_meeting_attendee_belongs();

-- Nobody is in two places at once.
--
-- The integrity rule this feature actually needs. Note what it does NOT check:
-- whether the time falls inside everyone's weekly free grid. rpc_meeting_slots
-- only ever OFFERS times from the intersection, but a student who has not filled
-- the grid in has an empty intersection, and a database that refused to schedule
-- them at all would make the feature unusable for exactly the people it is meant
-- to get organised. Double-booking is different: it is impossible in the world,
-- so it should be impossible in the table.
create or replace function public.check_meeting_no_clash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_span tstzrange;
begin
  if new.rsvp <> 'going' then
    return new;
  end if;

  select tstzrange(m.starts_at, m.ends_at, '[)')
  into v_span
  from public.meetings m
  where m.id = new.meeting_id
    and m.status = 'scheduled';

  if v_span is null then
    return new;
  end if;

  if exists (
    select 1
    from public.meeting_attendees a
    join public.meetings other on other.id = a.meeting_id
    where a.profile_id = new.profile_id
      and a.meeting_id <> new.meeting_id
      and a.rsvp = 'going'
      and other.status = 'scheduled'
      and tstzrange(other.starts_at, other.ends_at, '[)') && v_span
  ) then
    raise exception 'That clashes with another meeting already in the diary.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

create trigger meeting_attendees_no_clash
  before insert or update on public.meeting_attendees
  for each row execute function public.check_meeting_no_clash();

-- Attendance cannot be rewritten after the fact.
--
-- "A user can cancel at any time BEFORE the meeting" — so the window closes when
-- it starts. This is what makes the Phase 7D rating rule tamper-proof rather than
-- merely stated: without it, cancel-skip-rejoin buys you the right to rate people
-- you never sat with.
create or replace function public.freeze_meeting_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_starts_at timestamptz;
begin
  if current_setting('role', true) is not distinct from 'service_role' then
    return new;
  end if;

  if new.meeting_id is distinct from old.meeting_id
     or new.profile_id is distinct from old.profile_id then
    raise exception 'An attendance cannot be reassigned.'
      using errcode = '42501';
  end if;

  select m.starts_at into v_starts_at
  from public.meetings m
  where m.id = new.meeting_id;

  if new.rsvp is distinct from old.rsvp and v_starts_at <= now() then
    raise exception 'This meeting has already started; attendance can no longer be changed.'
      using errcode = '42501';
  end if;

  if new.rsvp is distinct from old.rsvp then
    new.responded_at := now();
  end if;

  return new;
end;
$$;

create trigger meeting_attendees_freeze
  before update on public.meeting_attendees
  for each row execute function public.freeze_meeting_attendance();

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

grant all privileges on public.meetings          to service_role;
grant all privileges on public.meeting_attendees to service_role;

-- Reading only. Every write goes through an RPC, because every write is more
-- than one row: booking is a meeting plus N attendees, and cancelling has to
-- free the slot for everyone in the same transaction. The one exception is a
-- student's own rsvp, which is a single row and is theirs to set.
grant select         on public.meetings          to authenticated;
grant select, update on public.meeting_attendees to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table meetings          enable row level security;
alter table meeting_attendees enable row level security;

-- A meeting is visible to the people invited to it. Not to the rest of the
-- group, and not to the class: where two students are meeting on Tuesday is a
-- more sensitive fact than that a group exists.
create policy "attendees can read their meetings"
  on public.meetings for select to authenticated
  using (public.app_is_meeting_attendee(id));

create policy "attendees can read the attendee list"
  on public.meeting_attendees for select to authenticated
  using (public.app_is_meeting_attendee(meeting_id));

-- You answer for yourself. The freeze trigger decides when, and the clash
-- trigger decides whether the answer is possible.
create policy "you can change your own rsvp"
  on public.meeting_attendees for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------

-- A meeting appearing in a chat, and someone dropping out of it, are both things
-- the other participants should see without refreshing. RLS applies to the
-- stream, so a socket only carries rows its owner may already read.
alter publication supabase_realtime add table public.meetings;
alter publication supabase_realtime add table public.meeting_attendees;

-- -----------------------------------------------------------------------------
-- The intersection
-- -----------------------------------------------------------------------------

-- Times every participant in a chat is free, with everyone's existing meetings
-- already subtracted.
--
-- SECURITY DEFINER, restating its own authorisation as rpc_approve_group_request
-- does: the caller must be in the conversation, or a member of the group. Definer
-- because it reads other students' availability, and because the answer must not
-- change depending on whether the caller can see each participant's profile
-- individually — a slot is either free for all of them or it is not.
--
-- WHY RANGES RATHER THAN MATCHING THE FIXED 2-HOUR BLOCKS. Grouping by
-- (day, start, end) and counting participants would be shorter, and it would be
-- correct only for as long as every row in availability_slots comes from the
-- onboarding grid. Phase 4c inverts real calendar busy times into free slots that
-- will not line up with it, and that version would silently drop every one of
-- them. Multirange intersection does not care where the boundaries fall.
create or replace function public.rpc_meeting_slots(
  p_conversation_id uuid default null,
  p_group_id uuid default null,
  p_from date default current_date,
  p_days int default 14
)
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  participant_count int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participants uuid[];
  v_timezone     text;
  v_days         int := least(greatest(coalesce(p_days, 14), 1), 60);
begin
  if (p_conversation_id is null) = (p_group_id is null) then
    raise exception 'Name exactly one of a conversation or a group.'
      using errcode = '22023';
  end if;

  if p_conversation_id is not null then
    select array[c.participant_a, c.participant_b]
    into v_participants
    from public.conversations c
    where c.id = p_conversation_id
      and auth.uid() in (c.participant_a, c.participant_b);
  else
    select array_agg(m.profile_id)
    into v_participants
    from public.study_group_members m
    where m.group_id = p_group_id
      and exists (
        select 1
        from public.study_group_members me
        where me.group_id = p_group_id
          and me.profile_id = auth.uid()
      );
  end if;

  if v_participants is null or cardinality(v_participants) = 0 then
    raise exception 'That chat is not yours.'
      using errcode = '42501';
  end if;

  v_timezone := public.app_university_timezone(auth.uid());

  return query
  with days as (
    select generate_series(
             coalesce(p_from, current_date),
             coalesce(p_from, current_date) + (v_days - 1),
             interval '1 day'
           )::date as on_date
  ),
  -- Each participant's weekly template, projected onto real dates in the campus
  -- timezone. range_agg merges adjacent 2-hour blocks into one span, so an
  -- afternoon marked 14-16 and 16-18 becomes a single 14-18 range.
  free as (
    select
      s.profile_id,
      d.on_date,
      range_agg(
        tstzrange(
          ((d.on_date + s.starts_at) at time zone v_timezone),
          ((d.on_date + s.ends_at) at time zone v_timezone),
          '[)'
        )
      ) as spans
    from days d
    join public.availability_slots s
      on s.day_of_week = extract(dow from d.on_date)::smallint
    where s.profile_id = any(v_participants)
    group by s.profile_id, d.on_date
  ),
  -- The intersection proper. The HAVING is what makes it an intersection rather
  -- than a union: a day where only three of four participants are free at all
  -- produces no rows, instead of quietly offering the three of them a time.
  common as (
    select
      f.on_date,
      range_intersect_agg(f.spans) as spans
    from free f
    group by f.on_date
    having count(*) = cardinality(v_participants)
  ),
  -- Everything any participant is already committed to. Derived from the
  -- meetings themselves — this is what "the timeslot is blocked" means.
  busy as (
    select coalesce(
             range_agg(tstzrange(m.starts_at, m.ends_at, '[)')),
             '{}'::tstzmultirange
           ) as spans
    from public.meetings m
    join public.meeting_attendees a on a.meeting_id = m.id
    where a.profile_id = any(v_participants)
      and a.rsvp = 'going'
      and m.status = 'scheduled'
      and m.ends_at > now()
  ),
  open_spans as (
    select c.on_date, c.spans - b.spans as spans
    from common c
    cross join busy b
  )
  select
    block.gs as starts_at,
    block.gs + interval '2 hours' as ends_at,
    cardinality(v_participants) as participant_count
  from open_spans o
  cross join lateral unnest(o.spans) as span
  cross join lateral generate_series(
    lower(span),
    upper(span) - interval '2 hours',
    interval '2 hours'
  ) as block(gs)
  where block.gs > now()
  order by block.gs;
end;
$$;

comment on function public.rpc_meeting_slots is
  'Two-hour slots every participant of a chat is free for, over the next p_days, with everyone''s existing meetings subtracted. Multirange intersection rather than block matching, so calendar-synced slots that do not align to the grid still work.';

revoke execute on function public.rpc_meeting_slots(uuid, uuid, date, int) from public;
grant execute on function public.rpc_meeting_slots(uuid, uuid, date, int) to authenticated;

-- -----------------------------------------------------------------------------
-- The student's own diary
-- -----------------------------------------------------------------------------

-- What "marked Busy in their schedule, with the meeting's info" reads from.
--
-- Invoker rights, unlike everything else here: it only ever reads the caller's
-- own attendance, so the policies above are exactly the right gate and there is
-- nothing to restate.
create or replace function public.rpc_my_schedule(
  p_from timestamptz default now(),
  p_to timestamptz default now() + interval '30 days'
)
returns table (
  meeting_id uuid,
  title text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  group_id uuid,
  conversation_id uuid,
  course_offering_id uuid,
  other_attendees int
)
language sql
stable
set search_path = ''
as $$
  select
    m.id,
    m.title,
    m.location,
    m.starts_at,
    m.ends_at,
    m.group_id,
    m.conversation_id,
    m.course_offering_id,
    (
      select count(*)::int
      from public.meeting_attendees other
      where other.meeting_id = m.id
        and other.rsvp = 'going'
        and other.profile_id <> auth.uid()
    ) as other_attendees
  from public.meetings m
  join public.meeting_attendees a
    on a.meeting_id = m.id
   and a.profile_id = auth.uid()
  where m.status = 'scheduled'
    -- Only what the student is actually going to. A cancelled rsvp frees the
    -- slot here the instant it is set, with no second table to keep in step.
    and a.rsvp = 'going'
    and m.ends_at > p_from
    and m.starts_at < p_to
  order by m.starts_at;
$$;

comment on function public.rpc_my_schedule is
  'The caller''s busy blocks and what fills them. Busy is derived from meetings they are going to — availability_slots is never written when a session is booked.';

revoke execute on function public.rpc_my_schedule(timestamptz, timestamptz) from public;
grant execute on function public.rpc_my_schedule(timestamptz, timestamptz) to authenticated;

-- -----------------------------------------------------------------------------
-- Booking
-- -----------------------------------------------------------------------------

-- Create a meeting and put everyone in the chat on it, in one transaction.
--
-- ONE FUNCTION FOR THE SAME REASON APPROVAL IS ONE FUNCTION. Booking is a
-- meeting row plus N attendee rows, and the clash trigger can reject any one of
-- those. Done from the application, a rejected fourth attendee would leave a
-- meeting that three people think is happening and a fourth has never heard of.
-- In here, the clash rolls the whole booking back.
--
-- THE ADVISORY LOCK is what makes "the last free Tuesday evening" safe. Two
-- students booking the same slot from two phones both pass the clash check —
-- neither row is visible to the other yet — and both insert. Locking on each
-- participant, in sorted order, makes the second wait and then fail the check
-- honestly. Sorted, because two bookings sharing two participants in opposite
-- orders would otherwise deadlock.
create or replace function public.rpc_create_meeting(
  p_conversation_id uuid,
  p_group_id uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participants uuid[];
  v_university   uuid;
  v_offering     uuid;
  v_meeting_id   uuid;
  v_participant  uuid;
begin
  if (p_conversation_id is null) = (p_group_id is null) then
    raise exception 'Name exactly one of a conversation or a group.'
      using errcode = '22023';
  end if;

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

  -- Sorted, to make the lock order total across concurrent bookings.
  foreach v_participant in array (select array_agg(p order by p) from unnest(v_participants) p)
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_participant::text, 0));
  end loop;

  insert into public.meetings (
    university_id, conversation_id, group_id, course_offering_id,
    created_by, title, location, starts_at, ends_at
  )
  values (
    v_university, p_conversation_id, p_group_id, v_offering,
    auth.uid(), btrim(p_title), nullif(btrim(coalesce(p_location, '')), ''),
    p_starts_at, p_ends_at
  )
  returning id into v_meeting_id;

  -- The clash trigger fires per row. If any participant is already committed,
  -- the whole booking is rolled back and nobody is left half-invited.
  insert into public.meeting_attendees (meeting_id, profile_id, rsvp, responded_at)
  select v_meeting_id, p, 'going', case when p = auth.uid() then now() end
  from unnest(v_participants) p;

  return v_meeting_id;
end;
$$;

comment on function public.rpc_create_meeting is
  'Books a session for everyone in a chat, atomically. Takes an advisory lock per participant in sorted order so two people booking the same slot cannot both win, and so two overlapping bookings cannot deadlock.';

revoke execute on function public.rpc_create_meeting(uuid, uuid, text, timestamptz, timestamptz, text) from public;
grant execute on function public.rpc_create_meeting(uuid, uuid, text, timestamptz, timestamptz, text) to authenticated;

-- Call the whole session off. Frees the slot for every attendee at once.
--
-- Only the organiser, and only before it starts. Everyone else has their own
-- rsvp for stepping out, which is a different act: one person not coming does
-- not mean the session is not happening.
create or replace function public.rpc_cancel_meeting(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_starts_at timestamptz;
begin
  select m.starts_at into v_starts_at
  from public.meetings m
  where m.id = p_meeting_id
    and m.status = 'scheduled'
    and m.created_by = auth.uid()
  for update;

  if v_starts_at is null then
    raise exception 'That meeting is not yours to cancel, or is already cancelled.'
      using errcode = '42501';
  end if;

  if v_starts_at <= now() then
    raise exception 'This meeting has already started.'
      using errcode = '42501';
  end if;

  update public.meetings
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid()
  where id = p_meeting_id;
end;
$$;

comment on function public.rpc_cancel_meeting is
  'Calls off the whole session, which frees the slot for every attendee at once. Restricted to the organiser; anyone else steps out by setting their own rsvp.';

revoke execute on function public.rpc_cancel_meeting(uuid) from public;
grant execute on function public.rpc_cancel_meeting(uuid) to authenticated;
