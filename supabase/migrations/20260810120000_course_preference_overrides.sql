-- =============================================================================
-- File:        supabase/migrations/20260810120000_course_preference_overrides.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Phase 4 — per-course preference overrides.
--
--              A student's study preferences are not actually global. Someone may
--              be happy on Zoom for a lecture course and need a whiteboard and a
--              table for linear algebra. Until now the schema forced one answer
--              across every course.
--
--              WHERE THE OVERRIDES LIVE: on `enrollments`. That table is already
--              keyed by exactly (profile_id, course_offering_id), already carries
--              a per-course answer in `intent`, and already has owner-scoped
--              insert/update/delete policies. A separate
--              course_preferences table would duplicate that key, need its own
--              four policies, and add a join to every matching query — for
--              nothing the existing row cannot hold. The Phase 1a comment on
--              learning_preferences called this out as a planned extension.
--
--              NULL MEANS INHERIT. Every override column is nullable, and null is
--              not "no preference" — it is "use my global answer". This is why
--              they are nullable arrays rather than empty ones: an empty array
--              would be indistinguishable from "I answered nothing", which the
--              global columns already forbid.
--
--              THE OVERRIDE HAS TO REACH THE SCORE, or it is decorative. The
--              matching function is rewritten below to resolve preferences PER
--              COURSE, so a student who sets "in person" for one course is
--              filtered against that course's candidates on that basis while
--              their other courses keep using the global answer.
-- Version:     0.14.0
--
-- Modifications:
--     0.14.0 - 2026-08-10 - Initial migration (Phase 4)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Override columns
-- -----------------------------------------------------------------------------

alter table enrollments
  add column preferred_time_blocks time_block[]
    check (preferred_time_blocks is null or cardinality(preferred_time_blocks) between 1 and 3),
  add column study_environments study_environment[]
    check (study_environments is null or cardinality(study_environments) between 1 and 2),
  add column study_formats study_format[]
    check (study_formats is null or cardinality(study_formats) between 1 and 2),
  add column group_sizes group_size_choice[]
    check (group_sizes is null or cardinality(group_sizes) between 1 and 2);

comment on column enrollments.preferred_time_blocks is
  'Per-course override. NULL means inherit learning_preferences.preferred_time_blocks — it does not mean "no preference", which the global column forbids anyway.';

comment on column enrollments.study_environments is
  'Per-course override of learning_preferences.study_environments. NULL inherits.';

comment on column enrollments.study_formats is
  'Per-course override of learning_preferences.study_formats. NULL inherits. This one changes who is shown at all, because format is a strict filter in the matching function.';

comment on column enrollments.group_sizes is
  'Per-course override of learning_preferences.group_sizes. NULL inherits.';

-- Saturday and spoken languages are deliberately NOT overridable. Neither is a
-- property of a course: a student who does not study on Saturday does not study
-- on Saturday for Linear Algebra either, and the language you can work in does
-- not change per subject. Adding columns nobody would ever set differently would
-- be four more nullable fields to reason about in the scoring function.

-- -----------------------------------------------------------------------------
-- Matching, resolving preferences per course
-- -----------------------------------------------------------------------------

-- Same signature and same return type as v2, so `create or replace` is enough
-- and nothing that calls it has to change. What changes is where the preference
-- values come from.
--
-- The `effective` CTE is the whole point: it resolves each side's preferences
-- ONCE, per pair and per course, and everything downstream reads only those
-- resolved values. Doing the coalesce inline at each comparison instead would
-- mean repeating it a dozen times, and one missed repetition would silently
-- score a course against the global answer.
create or replace function public.rpc_find_candidates(
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
      theirs.intent as their_intent,
      /* Per-course overrides. Null on either side means "use the global answer". */
      mine.preferred_time_blocks as my_time_override,
      mine.study_environments as my_environment_override,
      mine.study_formats as my_format_override,
      mine.group_sizes as my_group_override,
      theirs.preferred_time_blocks as their_time_override,
      theirs.study_environments as their_environment_override,
      theirs.study_formats as their_format_override,
      theirs.group_sizes as their_group_override
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
  /*
   * Preferences as they apply TO THIS COURSE, for both students.
   *
   * Everything below reads these columns and never the global ones, so a course
   * with an override is scored on the override and a course without one is
   * scored on the global answer — including the strict format filter, which is
   * what makes "Zoom generally, in person for this class" actually change who
   * appears.
   */
  effective as (
    select
      pairs.course_offering_id,
      pairs.course_code,
      pairs.course_name,
      pairs.candidate_id,
      pairs.their_intent,
      me.id as my_id,
      me.university_id as my_university_id,
      me.city as my_city,
      me.year_of_study as my_year_of_study,
      me.degree_level as my_degree_level,
      me.spoken_languages as my_languages,
      me.studies_on_saturday as my_saturday,
      theirs.spoken_languages as their_languages,
      theirs.studies_on_saturday as their_saturday,
      coalesce(pairs.my_time_override, me.preferred_time_blocks) as my_time_blocks,
      coalesce(pairs.my_environment_override, me.study_environments) as my_environments,
      coalesce(pairs.my_format_override, me.study_formats) as my_formats,
      coalesce(pairs.my_group_override, me.group_sizes) as my_group_sizes,
      coalesce(pairs.their_time_override, theirs.preferred_time_blocks) as their_time_blocks,
      coalesce(pairs.their_environment_override, theirs.study_environments) as their_environments,
      coalesce(pairs.their_format_override, theirs.study_formats) as their_formats,
      coalesce(pairs.their_group_override, theirs.group_sizes) as their_group_sizes
    from pairs
    join me on true
    join public.learning_preferences theirs on theirs.profile_id = pairs.candidate_id
  ),
  measured as (
    select
      effective.course_offering_id,
      effective.course_code,
      effective.course_name,
      effective.candidate_id,
      candidate.full_name,
      candidate.avatar_url,
      candidate_degree.name as degree_name,
      candidate_degree.level as degree_level,
      candidate.city,
      candidate.year_of_study,
      effective.their_intent as intent,
      public.app_overlap_minutes(effective.my_id, effective.candidate_id) as overlap_minutes,
      public.app_shared_days(effective.my_id, effective.candidate_id) as shared_days,
      /*
       * The candidate's preferences AS THEY APPLY HERE, not their global ones.
       * The card shows what governs this course, which is the honest thing to
       * show on a course page.
       */
      effective.their_time_blocks as preferred_time_blocks,
      effective.their_environments as study_environments,
      effective.their_formats as study_formats,
      effective.their_group_sizes as group_sizes,
      effective.their_saturday as studies_on_saturday,
      (
        select count(*)::int
        from public.enrollments a
        join public.enrollments b
          on b.course_offering_id = a.course_offering_id
         and b.profile_id = effective.candidate_id
        where a.profile_id = effective.my_id
      ) as shared_course_count,

      /* --- the comparisons the score is built from --------------------- */

      /* Exact means the SETS are equal, not merely overlapping. */
      (effective.my_time_blocks <@ effective.their_time_blocks
        and effective.my_time_blocks @> effective.their_time_blocks) as hours_exact,
      (effective.my_time_blocks && effective.their_time_blocks) as hours_overlap,
      (effective.my_environments <@ effective.their_environments
        and effective.my_environments @> effective.their_environments) as environment_exact,
      (effective.my_environments && effective.their_environments) as environment_overlap,
      (effective.my_group_sizes && effective.their_group_sizes) as group_overlap,
      (effective.my_languages && effective.their_languages) as language_overlap,
      (effective.my_saturday = effective.their_saturday) as saturday_same,

      /* --- bonus conditions ------------------------------------------- */

      (
        effective.my_city is not null and candidate.city is not null
        and lower(trim(effective.my_city)) = lower(trim(candidate.city))
      ) as same_city,
      coalesce(public.app_age_gap_years(effective.my_id, effective.candidate_id) <= 3, false)
        as close_in_age,
      (
        effective.my_year_of_study is not null
        and effective.my_year_of_study = candidate.year_of_study
        and effective.my_degree_level is not null
        and effective.my_degree_level = candidate_degree.level
      ) as same_cohort,

      public.app_array_jaccard(effective.my_time_blocks, effective.their_time_blocks)
        as hours_jaccard
    from effective
    join public.profiles candidate on candidate.id = effective.candidate_id
    left join public.degrees candidate_degree on candidate_degree.id = candidate.degree_id
    where
      candidate.university_id = effective.my_university_id
      and candidate.is_discoverable
      and candidate.onboarding_completed_at is not null
      /*
       * STRICT FILTER: study format, now resolved per course. Disjoint formats
       * mean there is no session these two could both attend, so this is an
       * exclusion rather than a penalty. `&&` is true when the arrays share any
       * element, so anyone who chose "both" still matches everyone.
       */
      and effective.my_formats && effective.their_formats
      and not exists (
        select 1
        from public.blocked_users b
        where (b.blocker_id = effective.my_id and b.blocked_id = effective.candidate_id)
           or (b.blocker_id = effective.candidate_id and b.blocked_id = effective.my_id)
      )
      and not exists (
        select 1
        from public.connection_requests r
        where r.course_offering_id = effective.course_offering_id
          and r.status in ('pending', 'accepted')
          and (
            (r.requester_id = effective.my_id and r.addressee_id = effective.candidate_id)
            or (r.requester_id = effective.candidate_id and r.addressee_id = effective.my_id)
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
         * courses the other candidate shares.
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
  'Ranked study-partner candidates, v3. Preferences are resolved PER COURSE: an enrollment-level override wins over the global answer, and null inherits. Study format is still a strict filter, disjoint study hours still halve the score, and the bonuses are unchanged.';

revoke execute on function public.rpc_find_candidates(uuid, int) from public;
grant execute on function public.rpc_find_candidates(uuid, int) to authenticated;
