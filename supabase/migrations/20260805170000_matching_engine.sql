-- =============================================================================
-- File:        supabase/migrations/20260805170000_matching_engine.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: The deterministic matching engine (Phase 2).
--
--              Scores every classmate in a shared course out of 100 and returns
--              them ranked. This is the prefilter the Phase 3 AI re-ranks; it is
--              also a complete, useful product on its own, which is the point —
--              if the AI is unavailable the app still finds partners.
--
--              SECURITY DEFINER, deliberately. The function must exclude a
--              candidate who has blocked the caller, and `blocked_users` is
--              readable in one direction only (you see blocks you made, never
--              ones naming you). Under invoker rights the reverse block would be
--              invisible and a student who blocked you would keep appearing.
--              Running as definer means every access rule RLS would normally
--              apply has to be restated here explicitly — see the WHERE clause,
--              and the adversarial tests that check it.
-- Version:     0.8.0
--
-- Modifications:
--     0.8.0 - 2026-08-05 - Initial implementation (Phase 2)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Set-overlap helpers
--
-- Every preference is now multi-select, so "compatibility" is the overlap
-- between two sets rather than the equality of two values. Two students who both
-- answer "mornings and evenings" agree completely; one who answers "mornings"
-- and one who answers "mornings and evenings" agree partly. Jaccard expresses
-- exactly that.
-- -----------------------------------------------------------------------------

create or replace function public.app_array_jaccard(a anyarray, b anyarray)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
           when a is null or b is null
             or cardinality(a) = 0 or cardinality(b) = 0 then 0
           else (
             select count(*)::numeric
             from (select unnest(a) intersect select unnest(b)) shared
           ) / nullif(
             (select count(*) from (select unnest(a) union select unnest(b)) combined),
             0
           )
         end;
$$;

comment on function public.app_array_jaccard is
  'Overlap of two sets as a 0-1 ratio. Used for the multi-select preference terms of the match score.';

-- The weekdays on which two students both have free time. Powers the "Shared
-- availability: Sun, Tue" line on a match card — a number of minutes is not
-- actionable, a day of the week is.
create or replace function public.app_shared_days(profile_a uuid, profile_b uuid)
returns smallint[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct x.day_of_week order by x.day_of_week), '{}')
  from public.availability_slots x
  join public.availability_slots y
    on y.day_of_week = x.day_of_week
   and y.profile_id = profile_b
  where x.profile_id = profile_a
    and least(x.ends_at, y.ends_at) > greatest(x.starts_at, y.starts_at);
$$;

-- -----------------------------------------------------------------------------
-- rpc_find_candidates
--
-- One function serves both screens: pass a course offering for that course's
-- dashboard, or omit it for the cross-course "matches" view. Two functions
-- sharing one scoring model would have drifted apart.
-- -----------------------------------------------------------------------------

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
  track_name text,
  year_of_study smallint,
  intent public.enrollment_intent,
  overlap_minutes int,
  shared_days smallint[],
  preferred_time_blocks public.time_block[],
  study_environments public.study_environment[],
  group_sizes public.group_size_choice[],
  studies_on_saturday boolean,
  shared_course_count int,
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
      lp.preferred_time_blocks,
      lp.study_environments,
      lp.group_sizes,
      lp.studies_on_saturday,
      lp.spoken_languages
    from public.profiles p
    join public.learning_preferences lp on lp.profile_id = p.id
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
      /* Only the live term: matching someone who took this course last year is
         the bug course_offerings exists to prevent. */
      and term.is_current
  ),
  scored as (
    select
      pairs.course_offering_id,
      pairs.course_code,
      pairs.course_name,
      pairs.candidate_id,
      candidate.full_name,
      candidate.avatar_url,
      track.name as track_name,
      candidate.year_of_study,
      pairs.their_intent as intent,
      public.app_overlap_minutes(me.id, pairs.candidate_id) as overlap_minutes,
      public.app_shared_days(me.id, pairs.candidate_id) as shared_days,
      theirs.preferred_time_blocks,
      theirs.study_environments,
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
      me.preferred_time_blocks as my_time_blocks,
      me.study_environments as my_environments,
      me.group_sizes as my_group_sizes,
      me.studies_on_saturday as my_saturday,
      me.spoken_languages as my_languages,
      theirs.spoken_languages as their_languages,
      pairs.my_intent
    from pairs
    join me on true
    join public.profiles candidate on candidate.id = pairs.candidate_id
    join public.learning_preferences theirs on theirs.profile_id = pairs.candidate_id
    left join public.study_tracks track on track.id = candidate.study_track_id
    where
      /*
       * Everything RLS would normally enforce, restated because this function
       * runs as definer. Tenancy first: a candidate must belong to the caller's
       * own university. The enrollment join already implies it via the shared
       * offering, so this is the belt to that braces.
       */
      candidate.university_id = me.university_id
      and candidate.is_discoverable
      and candidate.onboarding_completed_at is not null
      /* Blocks count in BOTH directions. This is the reason for definer rights:
         a block naming the caller is invisible under RLS. */
      and not exists (
        select 1
        from public.blocked_users b
        where (b.blocker_id = me.id and b.blocked_id = pairs.candidate_id)
           or (b.blocker_id = pairs.candidate_id and b.blocked_id = me.id)
      )
      /* Already asked, or already partners: nothing left to suggest. */
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
  )
  select
    scored.course_offering_id,
    scored.course_code,
    scored.course_name,
    scored.candidate_id,
    scored.full_name,
    scored.avatar_url,
    scored.track_name,
    scored.year_of_study,
    scored.intent,
    scored.overlap_minutes,
    scored.shared_days,
    scored.preferred_time_blocks,
    scored.study_environments,
    scored.group_sizes,
    scored.studies_on_saturday,
    scored.shared_course_count,
    round(
      /*
       * The 100-point model from design section 1.7.
       *
       * Schedule overlap carries the most weight because it is the only term
       * that can make studying together impossible rather than merely
       * unpleasant. Eight hours a week of shared free time saturates it — past
       * that, more overlap does not make a better partner.
       */
      least(scored.overlap_minutes, 480)::numeric / 480 * 40
      + public.app_array_jaccard(scored.my_time_blocks, scored.preferred_time_blocks) * 20
      + case when scored.my_environments && scored.study_environments then 15 else 0 end
      + case when scored.my_group_sizes && scored.group_sizes then 8 else 0 end
      /* No shared language means no shared session, whatever else lines up. */
      + case when scored.my_languages && scored.their_languages then 7 else 0 end
      + case when scored.my_saturday = scored.studies_on_saturday then 5 else 0 end
      + case
          /* Someone who can tutor and someone who needs help are the strongest
             pairing in the model: both get exactly what they came for. */
          when (scored.my_intent = 'can_tutor' and scored.intent = 'need_help')
            or (scored.my_intent = 'need_help' and scored.intent = 'can_tutor') then 5
          when scored.my_intent = 'want_partner' and scored.intent = 'want_partner' then 4
          when scored.my_intent = 'need_help' and scored.intent = 'need_help' then 2
          else 3
        end,
      1
    ) as rule_score
  from scored
  order by rule_score desc, scored.overlap_minutes desc, scored.full_name
  limit greatest(p_limit, 1);
$$;

comment on function public.rpc_find_candidates is
  'Ranked study-partner candidates. Pass a course offering for one course, or omit it for all of the caller''s current-term courses. SECURITY DEFINER so that blocks naming the caller are visible; every RLS rule is restated in its WHERE clause.';

revoke execute on function public.rpc_find_candidates(uuid, int) from public;
grant execute on function public.rpc_find_candidates(uuid, int) to authenticated;

-- Neither helper is exposed to clients. rpc_find_candidates runs as definer and
-- therefore as the owner, so it can call them regardless; granting them to
-- `authenticated` would widen the surface for no gain.
revoke execute on function public.app_shared_days(uuid, uuid) from public;
revoke execute on function public.app_array_jaccard(anyarray, anyarray) from public;
