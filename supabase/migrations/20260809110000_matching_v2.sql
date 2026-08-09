-- =============================================================================
-- File:        supabase/migrations/20260809110000_matching_v2.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Matching algorithm v2.
--
--              THE RULE THIS VERSION EXISTS TO ENFORCE: an exact match on study
--              hours and environment with ONE shared course must beat many
--              shared courses with opposite hours.
--
--              Weights alone cannot guarantee that. Given enough other terms, a
--              candidate with opposite hours could still out-total one with
--              matching hours. So a disjoint time-of-day preference applies a
--              MULTIPLICATIVE HALVING to the whole core score, which no amount
--              of shared courses can climb back from. Two people who are never
--              free at the same time of day cannot study together, however much
--              else they have in common.
--
--              Study format is a strict filter rather than a weight, for the
--              same reason taken to its conclusion: someone who will only meet
--              in person and someone who will only meet on Zoom have nothing to
--              arrange, so they are not shown to each other at all.
--
--              Still SECURITY DEFINER, and still therefore obliged to restate
--              every RLS rule in its WHERE clause. See tests/integration.
-- Version:     0.9.0
--
-- Modifications:
--     0.8.0 - 2026-08-05 - v1: set-overlap model (Phase 2)
--     0.9.0 - 2026-08-09 - v2: strict format filter, hours/environment made
--                          dominant, bonuses for city, age gap and cohort
-- =============================================================================

-- Age gap in whole years between two students, or null when either has not
-- given a date of birth.
--
-- SECURITY DEFINER because profile_private is readable only by its owner. It
-- returns a GAP, never a date — the sensitive value stays in the database, and
-- what leaves is the derived fact matching actually needs.
create or replace function public.app_age_gap_years(profile_a uuid, profile_b uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when a.date_of_birth is null or b.date_of_birth is null then null
           else abs(
             extract(year from age(a.date_of_birth))::int
             - extract(year from age(b.date_of_birth))::int
           )
         end
  from public.profile_private a, public.profile_private b
  where a.profile_id = profile_a
    and b.profile_id = profile_b;
$$;

comment on function public.app_age_gap_years is
  'Whole-year age gap between two students, or null if either withheld a date of birth. Returns only the gap; the dates never leave the database.';

revoke execute on function public.app_age_gap_years(uuid, uuid) from public;

-- `create or replace` cannot change a function's return type, and v2 returns
-- more columns than v1. The signature is unchanged, so callers are unaffected.
drop function if exists public.rpc_find_candidates(uuid, int);

create function public.rpc_find_candidates(
  p_course_offering_id uuid default null,
  p_limit int default 20
)
returns table (
  course_offering_id uuid,
  course_code text,
  course_name text,
  candidate_id uuid,
  full_name text,
  avatar_url text,
  track_name text,
  degree_name text,
  degree_level public.degree_level,
  city text,
  year_of_study smallint,
  intent public.enrollment_intent,
  overlap_minutes int,
  shared_days smallint[],
  preferred_time_blocks public.time_block[],
  study_environments public.study_environment[],
  study_formats public.study_format[],
  group_sizes public.group_size_choice[],
  studies_on_saturday boolean,
  shared_course_count int,
  /* Exposed so a card can explain the score rather than just assert it. */
  hours_exact boolean,
  environment_exact boolean,
  same_city boolean,
  close_in_age boolean,
  same_cohort boolean,
  bonus_points numeric,
  rule_score numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select
      p.id,
      p.university_id,
      p.city,
      p.year_of_study,
      p.degree_id,
      d.level as degree_level,
      lp.preferred_time_blocks,
      lp.study_environments,
      lp.study_formats,
      lp.group_sizes,
      lp.studies_on_saturday,
      lp.spoken_languages
    from public.profiles p
    join public.learning_preferences lp on lp.profile_id = p.id
    left join public.degrees d on d.id = p.degree_id
    where p.id = auth.uid()
  ),
  pairs as (
    select
      mine.course_offering_id,
      course.code as course_code,
      course.name as course_name,
      theirs.profile_id as candidate_id,
      mine.intent as my_intent,
      theirs.intent as their_intent
    from me
    join public.enrollments mine on mine.profile_id = me.id
    join public.course_offerings offering on offering.id = mine.course_offering_id
    join public.courses course on course.id = offering.course_id
    join public.terms term on term.id = offering.term_id
    join public.enrollments theirs
      on theirs.course_offering_id = mine.course_offering_id
     and theirs.profile_id <> me.id
    where (p_course_offering_id is null or mine.course_offering_id = p_course_offering_id)
      and term.is_current
  ),
  measured as (
    select
      pairs.course_offering_id,
      pairs.course_code,
      pairs.course_name,
      pairs.candidate_id,
      candidate.full_name,
      candidate.avatar_url,
      track.name as track_name,
      candidate_degree.name as degree_name,
      candidate_degree.level as degree_level,
      candidate.city,
      candidate.year_of_study,
      pairs.their_intent as intent,
      public.app_overlap_minutes(me.id, pairs.candidate_id) as overlap_minutes,
      public.app_shared_days(me.id, pairs.candidate_id) as shared_days,
      theirs.preferred_time_blocks,
      theirs.study_environments,
      theirs.study_formats,
      theirs.group_sizes,
      theirs.studies_on_saturday,
      (
        select count(*)::int
        from public.enrollments a
        join public.enrollments b
          on b.course_offering_id = a.course_offering_id
         and b.profile_id = pairs.candidate_id
        where a.profile_id = me.id
      ) as shared_course_count,

      /* --- the comparisons the score is built from --------------------- */

      /* Exact means the SETS are equal, not merely overlapping. */
      (me.preferred_time_blocks <@ theirs.preferred_time_blocks
        and me.preferred_time_blocks @> theirs.preferred_time_blocks) as hours_exact,
      (me.preferred_time_blocks && theirs.preferred_time_blocks) as hours_overlap,
      (me.study_environments <@ theirs.study_environments
        and me.study_environments @> theirs.study_environments) as environment_exact,
      (me.study_environments && theirs.study_environments) as environment_overlap,
      (me.group_sizes && theirs.group_sizes) as group_overlap,
      (me.spoken_languages && theirs.spoken_languages) as language_overlap,
      (me.studies_on_saturday = theirs.studies_on_saturday) as saturday_same,

      /* --- bonus conditions ------------------------------------------- */

      (
        me.city is not null and candidate.city is not null
        and lower(trim(me.city)) = lower(trim(candidate.city))
      ) as same_city,
      coalesce(public.app_age_gap_years(me.id, pairs.candidate_id) <= 3, false) as close_in_age,
      (
        me.year_of_study is not null
        and me.year_of_study = candidate.year_of_study
        and me.degree_level is not null
        and me.degree_level = candidate_degree.level
      ) as same_cohort,

      public.app_array_jaccard(me.preferred_time_blocks, theirs.preferred_time_blocks) as hours_jaccard
    from pairs
    join me on true
    join public.profiles candidate on candidate.id = pairs.candidate_id
    join public.learning_preferences theirs on theirs.profile_id = pairs.candidate_id
    left join public.study_tracks track on track.id = candidate.study_track_id
    left join public.degrees candidate_degree on candidate_degree.id = candidate.degree_id
    where
      candidate.university_id = me.university_id
      and candidate.is_discoverable
      and candidate.onboarding_completed_at is not null
      /*
       * STRICT FILTER: study format. Disjoint formats mean there is no session
       * these two could both attend, so this is an exclusion rather than a
       * penalty. `&&` is true when the arrays share any element, so anyone who
       * chose "both" still matches everyone.
       */
      and me.study_formats && theirs.study_formats
      and not exists (
        select 1
        from public.blocked_users b
        where (b.blocker_id = me.id and b.blocked_id = pairs.candidate_id)
           or (b.blocker_id = pairs.candidate_id and b.blocked_id = me.id)
      )
      and not exists (
        select 1
        from public.connection_requests r
        where r.course_offering_id = pairs.course_offering_id
          and r.status in ('pending', 'accepted')
          and (
            (r.requester_id = me.id and r.addressee_id = pairs.candidate_id)
            or (r.requester_id = pairs.candidate_id and r.addressee_id = me.id)
          )
      )
  ),
  scored as (
    select
      measured.*,
      /*
       * CORE, out of 85. Hours and environment together carry 50 of it — they
       * are the terms that decide whether studying together is pleasant or
       * merely possible, and the spec makes them primary.
       */
      (
        case
          when measured.hours_exact then 28
          when measured.hours_overlap then round(28 * measured.hours_jaccard, 2)
          else 0
        end
        + case
            when measured.environment_exact then 22
            when measured.environment_overlap then 16
            else 0
          end
        /* Actual overlapping free minutes. Saturates at 8h/week. */
        + least(measured.overlap_minutes, 480)::numeric / 480 * 18
        /*
         * Shared courses, capped at 9. Deliberately modest: the spec requires
         * that stacking courses never beat matching hours, and the halving
         * below makes that hold even at the cap.
         */
        + least(3 + (measured.shared_course_count - 1) * 3, 9)
        + case when measured.language_overlap then 4 else 0 end
        + case when measured.group_overlap then 2 else 0 end
        + case when measured.saturday_same then 2 else 0 end
      ) as core_raw,
      /* BONUSES, out of 15. */
      (
        case when measured.same_city then 6 else 0 end
        + case when measured.close_in_age then 5 else 0 end
        + case when measured.same_cohort then 4 else 0 end
      )::numeric as bonus_points
    from measured
  )
  select
    scored.course_offering_id,
    scored.course_code,
    scored.course_name,
    scored.candidate_id,
    scored.full_name,
    scored.avatar_url,
    scored.track_name,
    scored.degree_name,
    scored.degree_level,
    scored.city,
    scored.year_of_study,
    scored.intent,
    scored.overlap_minutes,
    scored.shared_days,
    scored.preferred_time_blocks,
    scored.study_environments,
    scored.study_formats,
    scored.group_sizes,
    scored.studies_on_saturday,
    scored.shared_course_count,
    scored.hours_exact,
    scored.environment_exact,
    scored.same_city,
    scored.close_in_age,
    scored.same_cohort,
    scored.bonus_points,
    round(
      least(
        100,
        /*
         * The halving. A disjoint time-of-day preference cuts the whole core in
         * half, which is what makes the spec's ordering hold no matter how many
         * courses the other candidate shares: at the extreme, a perfect
         * everything-else-but-opposite-hours candidate cannot reach an
         * exact-hours-and-environment one.
         */
        case when scored.hours_overlap then scored.core_raw else scored.core_raw * 0.5 end
        + scored.bonus_points
      ),
      1
    ) as rule_score
  from scored
  order by rule_score desc, scored.overlap_minutes desc, scored.full_name
  limit greatest(p_limit, 1);
$$;

comment on function public.rpc_find_candidates is
  'Ranked study-partner candidates, v2. Study format is a strict filter; disjoint study hours halve the score so shared-course count can never outrank matching hours; bonuses for same city, age gap within 3 years, and same year plus degree level.';

revoke execute on function public.rpc_find_candidates(uuid, int) from public;
grant execute on function public.rpc_find_candidates(uuid, int) to authenticated;
