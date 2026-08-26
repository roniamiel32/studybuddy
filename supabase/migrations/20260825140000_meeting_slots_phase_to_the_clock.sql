-- =============================================================================
-- File:        supabase/migrations/20260825140000_meeting_slots_phase_to_the_clock.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: A booking stops shifting the rest of the day's blocks.
--
--              THE SYMPTOM. Book a 45-minute session at 14:00 and the evening
--              block came back as 20:45-22:00 instead of 20:00-22:00 — an hour
--              and a quarter where there should have been two hours. It read
--              exactly as though the meeting's duration had been deducted from
--              the last block of the day.
--
--              THE FREE/BUSY MATH WAS NEVER WRONG. `common.spans - busy.spans`
--              is multirange subtraction and punches the hole precisely at
--              14:00-14:45, which is what it should do. The fault was one line
--              further down: generate_series was phased from `lower(span)`, and
--              after a booking the span starts at the booking's END. So the
--              blocks after it were laid out from 14:45 — 14:45, 16:45, 18:45,
--              20:45 — every one shifted by the length of the meeting, and the
--              last one truncated by it at 22:00.
--
--              THE FIX IS TO PHASE THE SERIES TO THE CLOCK. Blocks are floored
--              to the even hour their span starts inside, in the campus timezone,
--              and then trimmed to the span at both ends. A booking now shortens
--              only the blocks it genuinely overlaps and leaves every other block
--              exactly where the picker's grid draws it.
--
--              WHY THE FRONTEND CLAMP STAYS. clampSlotsToGridRows re-cuts these
--              blocks against the READER's local rows, which is a different
--              question — this function knows the campus timezone and nothing
--              about where the student is sitting. For everyone in the campus
--              zone the two now agree exactly and the clamp is a no-op; for a
--              student abroad it is still what keeps their grid honest.
-- Version:     1.0.1
--
-- Modifications:
--     1.0.1 - 2026-08-25 - Phase blocks to the wall clock, not to the span start
-- =============================================================================

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
      date_trunc('day', lower(span) at time zone v_timezone)
      + (floor(extract(hour from lower(span) at time zone v_timezone) / 2) * 2) * interval '1 hour'
    ) at time zone v_timezone,
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
  'Slots every participant of a chat is free for, over the next p_days, with everyone''s existing meetings subtracted. Blocks are aligned to the campus wall clock in two-hour steps and trimmed to the free time around them, so a booking shortens only the blocks it overlaps.';
