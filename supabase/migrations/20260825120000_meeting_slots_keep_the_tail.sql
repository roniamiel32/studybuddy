-- =============================================================================
-- File:        supabase/migrations/20260825120000_meeting_slots_keep_the_tail.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: The scheduler stops throwing away the end of every free span.
--
--              WHAT WAS WRONG. The slot series was generated with
--              `generate_series(lower(span), upper(span) - interval '2 hours',
--              interval '2 hours')`, which stops two hours before the span ends.
--              Any remainder shorter than a full block was therefore never
--              offered: two students free from 15:00 to 22:00 were shown times
--              up to 21:00 and the last hour simply did not exist as far as the
--              picker was concerned.
--
--              WORSE, AND LESS OBVIOUS: a span SHORTER than two hours produced no
--              rows at all, because `upper - 2 hours` lands before `lower` and
--              generate_series returns nothing. A pair with a single free hour
--              between two bookings were told they had no shared time whatsoever
--              — the one situation where the feature is most needed.
--
--              THE FIX IS THE TWO ENDS OF THE SAME EXPRESSION. The series now
--              runs to just short of the span's upper bound, and each block's end
--              is clamped to that bound with `least`. Spans that divide evenly
--              into two-hour blocks are completely unaffected; everything else
--              gains one final, shorter block.
--
--              THE FRONTEND ALREADY COPES. clampSlotsToGridRows rebuilds the
--              contiguous span from whatever blocks arrive and re-cuts it on the
--              picker's own two-hour rows, in the reader's timezone. A short
--              tail block is merged back in and re-cut with everything else, so
--              this change adds bookable time without moving any existing cell.
-- Version:     1.0.0
--
-- Modifications:
--     1.0.0 - 2026-08-25 - Keep the final partial block of every free span
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
    block.gs as starts_at,
    -- Never past the end of the span it came from. The step is still two hours,
    -- so a span that divides evenly is unchanged; what this adds is the short
    -- final block that used to be discarded.
    least(block.gs + interval '2 hours', upper(span)) as ends_at,
    cardinality(v_participants) as participant_count
  from open_spans o
  cross join lateral unnest(o.spans) as span
  cross join lateral generate_series(
    lower(span),
    -- Was `upper(span) - interval '2 hours'`, which stops the series two hours
    -- early and is what dropped the tail. Stopping just short of the upper bound
    -- emits one more block for whatever is left, however little that is.
    upper(span) - interval '1 microsecond',
    interval '2 hours'
  ) as block(gs)
  where block.gs > now()
  order by block.gs;
end;
$$;

comment on function public.rpc_meeting_slots is
  'Slots every participant of a chat is free for, over the next p_days, with everyone''s existing meetings subtracted. Blocks are two hours except the last of each free span, which is whatever remains. Multirange intersection rather than block matching, so calendar-synced slots that do not align to the grid still work.';
