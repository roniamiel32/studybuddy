-- =============================================================================
-- File:        supabase/migrations/20260826100000_meeting_slots_israel_time.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: The slot picker computes strictly in Israel time.
--
--              WHAT THIS CHANGES, AND WHAT IT DOES NOT. The zone was already
--              Asia/Jerusalem for every caller — universities.timezone holds
--              that string in every row, and app_university_timezone coalesced
--              to it besides — so the projections below produce byte-identical
--              instants before and after. This is a simplification, not a
--              correction: one stated constant instead of a per-caller lookup
--              that could only ever return one answer.
--
--              THE ONE REAL FIX IS THE WINDOW. `p_from date default current_date`
--              was evaluated in the SESSION's timezone, which is UTC on Supabase.
--              Between midnight and 03:00 Israel time that names yesterday, so
--              the picker offered a day that had already gone and dropped the day
--              at the far end of the window. The default is now resolved in the
--              body, from Israel's own calendar.
--
--              WHERE THE THREE HOURS ACTUALLY COME FROM. Not here. Every
--              timestamp this function returns is an absolute instant, correct in
--              any zone. The offset appears when those instants are FORMATTED,
--              and the formatters used whichever zone the code happened to run
--              in — the browser's on a student's laptop, and UTC on a Vercel
--              server rendering the same component. That is why it looked right
--              locally and wrong in production, and it is fixed in
--              features/meetings/meeting-view.ts rather than in SQL.
-- Version:     1.0.3
--
-- Modifications:
--     1.0.3 - 2026-08-26 - Campus zone hardcoded; the day window is Israel's
-- =============================================================================

create or replace function public.rpc_meeting_slots(
  p_conversation_id uuid default null,
  p_group_id uuid default null,
  -- NULL, not current_date: the default is resolved inside the body, in Israel
  -- time. `current_date` here would be evaluated in the session's timezone, which
  -- is UTC — so between midnight and 03:00 Israel time it names yesterday.
  p_from date default null,
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
  /*
   * HARDCODED, deliberately. This used to be read per caller from
   * universities.timezone via app_university_timezone, which was groundwork for
   * institutions in other zones — and every row in that column is
   * 'Asia/Jerusalem'. The indirection bought nothing and gave the offset one
   * more place to be wrong, so the campus clock is stated here, once, and every
   * conversion below names it.
   */
  v_campus_tz    constant text := 'Asia/Jerusalem';
  v_participants uuid[];
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


  return query
  with days as (
    select generate_series(
             coalesce(p_from, (now() at time zone v_campus_tz)::date),
             coalesce(p_from, (now() at time zone v_campus_tz)::date) + (v_days - 1),
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
          ((d.on_date + s.starts_at) at time zone v_campus_tz),
          ((d.on_date + s.ends_at) at time zone v_campus_tz),
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
    -- Trimmed to the span at both ends. The series is phased to the wall clock,
    -- so its first block usually starts before the span does.
    greatest(block.gs, lower(span)) as starts_at,
    least(block.gs + interval '2 hours', upper(span)) as ends_at,
    cardinality(v_participants) as participant_count
  from open_spans o
  cross join lateral unnest(o.spans) as span
  cross join lateral generate_series(
    -- THE DAY'S OWN TWO-HOUR GRID, not the span's start.
    --
    -- This used to be `lower(span)`, which phased every block off wherever the
    -- span happened to begin — and a span begins wherever the last booking
    -- ended. A 45-minute meeting at 14:00 left free time from 14:45, so the rest
    -- of the day came back as 14:45, 16:45, 18:45, 20:45: every later block
    -- shifted three quarters of an hour, and the last one 45 minutes shorter.
    -- The hole was punched in exactly the right place; what went wrong is that
    -- everything after it was re-phased to the hole.
    --
    -- Flooring to the even hour the span starts inside pins the blocks to the
    -- clock instead. A booking now removes time from the blocks it actually
    -- covers and leaves every other block where it was.
    (
      date_trunc('day', lower(span) at time zone v_campus_tz)
      + (floor(extract(hour from lower(span) at time zone v_campus_tz) / 2) * 2) * interval '1 hour'
    ) at time zone v_campus_tz,
    -- Just short of the upper bound, so the final partial block is emitted too.
    upper(span) - interval '1 microsecond',
    interval '2 hours'
  ) as block(gs)
  -- The first block of a span can be entirely before it once phasing is applied.
  where least(block.gs + interval '2 hours', upper(span))
        > greatest(block.gs, lower(span))
    and greatest(block.gs, lower(span)) > now()
  order by 1;
end;
$$;

comment on function public.rpc_meeting_slots is
  'Slots every participant of a chat is free for, over the next p_days, with everyone''s existing meetings subtracted. Computes strictly in Asia/Jerusalem: the weekly grid is projected onto Israeli dates, blocks are aligned to the Israeli wall clock, and the default window starts on Israel''s today rather than UTC''s.';
