-- =============================================================================
-- File:        supabase/migrations/20260817140000_group_candidate_score.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: How well an applicant fits a group, for the founder deciding.
--
--              A GROUP IS NOT A PERSON, which is why rpc_find_candidates cannot
--              answer this. That function scores one student against one other;
--              accepting somebody into a group is a question about the group as
--              an entity — specifically about the hours all of its members
--              already share, which is what their sessions get booked in. A
--              candidate who matches the founder beautifully and is busy every
--              hour the group actually meets is the exact case the founder
--              cannot see today, and the one that quietly ruins the schedule.
--
--              SO AVAILABILITY IS MEASURED AGAINST THE INTERSECTION, not against
--              any one member. The group's shared week is the same derivation
--              rpc_meeting_slots uses to offer times — every member's slots
--              intersected, so a member free at no common hour empties it. What
--              is scored is how much of THAT the candidate also has. It cannot
--              be an average of pairwise overlaps: averaging hides exactly the
--              case that matters, because two good pairings either side of a
--              disjoint one still average well.
--
--              PREFERENCES ARE THE OPPOSITE SHAPE, and are averaged on purpose.
--              "Do they study the way we do" is a question about fitting in with
--              people rather than with a timetable, and it degrades gracefully:
--              being a fair fit with everyone is a real answer, where an
--              intersection of preferences would demand unanimity on five
--              separate axes and return zero for almost every group.
--
--              THE WEIGHTING IS 60/40 TOWARDS AVAILABILITY. Both matter, but only
--              one of them can make the group unable to meet — and that is the
--              problem this bubble was asked for. It also matches the shape of
--              rpc_find_candidates, where the hours terms are worth more than
--              every preference term combined.
--
--              WEEK-MINUTES AS int4range IS THE TRICK THAT MAKES THIS CHEAP.
--              availability_slots holds a weekday and two `time` values, which
--              cannot be intersected across N people directly. Folding each slot
--              into minutes-since-Sunday-midnight turns a week into one integer
--              multirange, and then range_intersect_agg does the group in a
--              single aggregate rather than a self-join per pair.
-- Version:     0.40.0
--
-- Modifications:
--     0.40.0 - 2026-08-17 - Initial implementation (Phase 11B)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. A student's week, as one multirange of minutes
-- -----------------------------------------------------------------------------

create or replace function public.app_week_spans(p_profile_id uuid)
returns int4multirange
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    range_agg(
      int4range(
        (s.day_of_week * 1440) + (extract(epoch from s.starts_at) / 60)::int,
        (s.day_of_week * 1440) + (extract(epoch from s.ends_at) / 60)::int
      )
    ),
    '{}'::int4multirange
  )
  from public.availability_slots s
  where s.profile_id = p_profile_id;
$$;

comment on function public.app_week_spans is
  'A student''s weekly free time as minutes since Sunday 00:00. Lets N weeks be intersected with one aggregate instead of a join per pair.';

-- -----------------------------------------------------------------------------
-- 2. The hours a whole group shares
-- -----------------------------------------------------------------------------

create or replace function public.app_group_week_spans(p_group_id uuid)
returns int4multirange
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_spans   int4multirange;
  v_members int;
begin
  select count(*) into v_members
  from public.study_group_members m
  where m.group_id = p_group_id;

  if v_members = 0 then
    return '{}'::int4multirange;
  end if;

  /*
   * The HAVING is what makes this an intersection rather than a union, exactly
   * as in rpc_meeting_slots: a member with no availability at all produces no
   * row, the count falls short, and the group's shared week is correctly empty
   * rather than quietly computed from everybody else.
   */
  select range_intersect_agg(w.spans)
  into v_spans
  from (
    select public.app_week_spans(m.profile_id) as spans
    from public.study_group_members m
    where m.group_id = p_group_id
  ) w
  having count(*) = v_members and bool_and(w.spans <> '{}'::int4multirange);

  return coalesce(v_spans, '{}'::int4multirange);
end;
$$;

comment on function public.app_group_week_spans is
  'The hours every member of a group is free, intersected. Empty when any member has no availability — the same rule rpc_meeting_slots uses to offer session times.';

-- -----------------------------------------------------------------------------
-- 3. How alike two students study
-- -----------------------------------------------------------------------------

create or replace function public.app_trait_affinity(
  p_a uuid,
  p_b uuid,
  p_course_offering_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  /*
   * 0 to 1 across five preference axes, per-course overrides applied where the
   * caller names a course — the same coalesce(enrolment, global) rpc_find_candidates
   * resolves, so a student who answered differently for THIS course is judged on
   * that answer here too.
   *
   * Study format is weighted highest because it is the one axis that is a
   * practical impossibility rather than a preference: somebody remote-only
   * cannot sit in the library with the rest of them.
   */
  with sides as (
    select
      coalesce(ea.study_formats, la.study_formats)             as a_formats,
      coalesce(eb.study_formats, lb.study_formats)             as b_formats,
      coalesce(ea.study_environments, la.study_environments)   as a_env,
      coalesce(eb.study_environments, lb.study_environments)   as b_env,
      coalesce(ea.group_sizes, la.group_sizes)                 as a_sizes,
      coalesce(eb.group_sizes, lb.group_sizes)                 as b_sizes,
      coalesce(ea.preferred_time_blocks, la.preferred_time_blocks) as a_blocks,
      coalesce(eb.preferred_time_blocks, lb.preferred_time_blocks) as b_blocks,
      la.spoken_languages    as a_langs,
      lb.spoken_languages    as b_langs,
      la.studies_on_saturday as a_sat,
      lb.studies_on_saturday as b_sat
    from public.learning_preferences la
    join public.learning_preferences lb on lb.profile_id = p_b
    left join public.enrollments ea
      on ea.profile_id = p_a and ea.course_offering_id = p_course_offering_id
    left join public.enrollments eb
      on eb.profile_id = p_b and eb.course_offering_id = p_course_offering_id
    where la.profile_id = p_a
  )
  select round(
    (
      case when sides.a_formats && sides.b_formats then 0.30 else 0 end
      + case
          when sides.a_env <@ sides.b_env and sides.a_env @> sides.b_env then 0.25
          when sides.a_env && sides.b_env then 0.15
          else 0
        end
      + public.app_array_jaccard(sides.a_blocks, sides.b_blocks) * 0.20
      + case when sides.a_sizes && sides.b_sizes then 0.10 else 0 end
      + case when sides.a_langs && sides.b_langs then 0.10 else 0 end
      + case when sides.a_sat = sides.b_sat then 0.05 else 0 end
    )::numeric,
    4
  )
  from sides;
$$;

comment on function public.app_trait_affinity is
  'How alike two students study, 0 to 1, across format, environment, time blocks, group size, language and Saturday. Applies per-course overrides when given a course, matching how rpc_find_candidates resolves preferences.';

-- -----------------------------------------------------------------------------
-- 4. The blended score the founder sees
-- -----------------------------------------------------------------------------

create or replace function public.rpc_group_candidate_score(
  p_group_id uuid,
  p_profile_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_offering       uuid;
  v_group_spans    int4multirange;
  v_shared_minutes int;
  v_group_minutes  int;
  v_availability   numeric := 0;
  v_traits         numeric := 0;
  v_members        int;
begin
  /*
   * VISIBLE ONLY TO PEOPLE WHO CAN ALREADY SEE THE GROUP. This is definer, so
   * the check has to be written out: without it the function would report how
   * well any student fits any group to anyone who asked, which is a read on
   * other people's availability that no policy grants.
   */
  if not public.app_can_see_group(p_group_id) then
    raise exception 'That group is not yours to read.'
      using errcode = '42501';
  end if;

  select g.course_offering_id into v_offering
  from public.study_groups g
  where g.id = p_group_id;

  v_group_spans := public.app_group_week_spans(p_group_id);

  /* Minutes the group shares, and how many of them the candidate also has. */
  select coalesce(sum(upper(r) - lower(r)), 0)
  into v_group_minutes
  from unnest(v_group_spans) r;

  select coalesce(sum(upper(r) - lower(r)), 0)
  into v_shared_minutes
  from unnest(v_group_spans * public.app_week_spans(p_profile_id)) r;

  /*
   * SCORED AS A SHARE OF THE GROUP'S OWN WEEK, not against a fixed target. A
   * group that is only ever free for four hours is not a worse group, and a
   * candidate who can make all four of them is a perfect fit for it — measuring
   * against a constant would score them the same as somebody who can make none.
   *
   * When the group shares nothing there is nothing to break, so availability
   * stops discriminating and the whole score falls to the trait half.
   */
  if v_group_minutes > 0 then
    v_availability := least(v_shared_minutes::numeric / v_group_minutes, 1);
  end if;

  select count(*) into v_members
  from public.study_group_members m
  where m.group_id = p_group_id and m.profile_id <> p_profile_id;

  if v_members > 0 then
    select coalesce(avg(public.app_trait_affinity(m.profile_id, p_profile_id, v_offering)), 0)
    into v_traits
    from public.study_group_members m
    where m.group_id = p_group_id and m.profile_id <> p_profile_id;
  end if;

  if v_group_minutes = 0 then
    return round(v_traits * 100, 1);
  end if;

  return round((v_availability * 0.60 + v_traits * 0.40) * 100, 1);
end;
$$;

comment on function public.rpc_group_candidate_score is
  'How well one student fits a group, 0-100: 60% the share of the group''s common free hours they can also make, 40% their average study-habit affinity with each member. Availability is measured against the intersection because that is what the group''s sessions are booked in.';

revoke execute on function public.rpc_group_candidate_score(uuid, uuid) from public;
grant execute on function public.rpc_group_candidate_score(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Every pending applicant at once
-- -----------------------------------------------------------------------------

create or replace function public.rpc_group_request_scores(p_group_id uuid)
returns table (request_id uuid, score numeric)
language sql
stable
security definer
set search_path = ''
as $$
  /*
   * One call for the whole review screen. Scoring each applicant from the client
   * would be a round trip per row, and the founder opens this with every pending
   * request already on screen.
   */
  select r.id, public.rpc_group_candidate_score(p_group_id, r.requester_id)
  from public.group_requests r
  where r.group_id = p_group_id
    and r.kind = 'request'
    and r.status = 'pending';
$$;

comment on function public.rpc_group_request_scores is
  'The group fit of every pending applicant, in one call. Inherits rpc_group_candidate_score''s visibility check.';

revoke execute on function public.rpc_group_request_scores(uuid) from public;
grant execute on function public.rpc_group_request_scores(uuid) to authenticated;
