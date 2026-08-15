-- =============================================================================
-- File:        supabase/migrations/20260815100000_matching_weights_v5.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Matching v5 — a softer refusal, a stricter introduction, and a
--              small reward for the people you already talk to.
--
--              1. A NEGATIVE RATING NOW SCALES, IT NO LONGER ERASES. It was a
--              symmetric hard exclusion; it is now a 0.75x multiplier on the
--              finished score. Somebody you did not get on with but share four
--              courses with can still surface below better options, which is the
--              behaviour asked for.
--
--              WHAT THAT COSTS, stated plainly because the exclusion was a
--              deliberate answer in Phase 6 and this reverses it: a negative
--              rating used to be the quiet way to say "stop showing me this
--              person", and it worked in both directions without ever telling
--              the other party. After this it only demotes them. The hard
--              exclusion still exists and is still symmetric — it is
--              `blocked_users`, which this migration does not touch. So the two
--              acts are now properly separated: rating badly is feedback that
--              affects ranking, blocking is refusal. Anyone relying on a
--              negative rating to make somebody disappear must block instead.
--
--              2. A TRANSITIVE SUGGESTION NOW HAS TO CLEAR THE SAME BAR AS A
--              MATCH. The old one joined `enrollments` to `enrollments` with no
--              term filter, so a course shared in a term that finished last year
--              was enough to introduce two people — and the card then showed "no
--              compatibility score", because rpc_find_candidates only counts
--              current terms and returned nothing for the pair. Rather than add
--              `term.is_current` and call it fixed, the suggestion now joins
--              rpc_find_candidates itself and requires rule_score > 0. One
--              definition of "these two could study together", used by both
--              features, so they cannot drift apart again.
--
--              3. ENGAGEMENT IS A TIE-BREAKER AND NOTHING MORE. Wall posts,
--              shares, likes and replies between the pair earn points, worth at
--              most +15% and applied as a multiplier — so it reorders people who
--              were already plausible and can never lift somebody with no shared
--              course above somebody with one. Depth is weighted over volume:
--              writing on a wall or sharing a post counts three times what a like
--              does, because a like costs nothing and ten of them should not
--              outrank a conversation.
-- Version:     0.32.0
--
-- Modifications:
--     0.32.0 - 2026-08-15 - Initial implementation (Phase 10A)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- How much two students actually interact
-- -----------------------------------------------------------------------------

create or replace function public.app_engagement_points(p_a uuid, p_b uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  /*
   * DIRECTED: what A has done towards B. The caller is always A, so a student
   * who reaches out repeatedly is rewarded for it whether or not it is returned
   * — an unanswered effort is still a signal about who they want to work with.
   *
   * WEIGHTS ARE THE POINT. A like is one, a reply is two, writing on somebody's
   * wall or passing their post on is three. The ceiling in rpc_find_candidates
   * is 15 points, so roughly five substantial interactions reach the maximum and
   * everything past that is free.
   */
  select coalesce((
    /* Wrote on their wall. Not a share — those are counted below. */
    select count(*) * 3
    from public.wall_posts w
    where w.profile_owner_id = p_b
      and w.author_id = p_a
      and w.original_post_id is null
  ), 0)
  + coalesce((
    /* Passed one of their posts on. */
    select count(*) * 3
    from public.wall_posts share
    join public.wall_posts source on source.id = share.original_post_id
    where share.author_id = p_a
      and source.author_id = p_b
  ), 0)
  + coalesce((
    /* Commented on a post of theirs, or replied inside one. */
    select count(*) * 2
    from public.post_comments c
    join public.wall_posts w on w.id = c.post_id
    where c.author_id = p_a
      and w.author_id = p_b
      and c.parent_comment_id is null
  ), 0)
  + coalesce((
    /* Replied directly to something they said. */
    select count(*) * 2
    from public.post_comments reply
    join public.post_comments parent on parent.id = reply.parent_comment_id
    where reply.author_id = p_a
      and parent.author_id = p_b
  ), 0)
  + coalesce((
    select count(*)
    from public.post_likes l
    join public.wall_posts w on w.id = l.post_id
    where l.profile_id = p_a
      and w.author_id = p_b
  ), 0)
  + coalesce((
    select count(*)
    from public.comment_likes l
    join public.post_comments c on c.id = l.comment_id
    where l.profile_id = p_a
      and c.author_id = p_b
  ), 0);
$$;

comment on function public.app_engagement_points is
  'Weighted count of what one student has done towards another on the social wall: writing and sharing score 3, comments and replies 2, likes 1. Directed, not symmetric. Read by rpc_find_candidates as a capped tie-breaker — never as a reason to match two people on its own.';

revoke execute on function public.app_engagement_points(uuid, uuid) from public;
grant execute on function public.app_engagement_points(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- The scorer
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

      (effective.my_time_blocks <@ effective.their_time_blocks
        and effective.my_time_blocks @> effective.their_time_blocks) as hours_exact,
      (effective.my_time_blocks && effective.their_time_blocks) as hours_overlap,
      (effective.my_environments <@ effective.their_environments
        and effective.my_environments @> effective.their_environments) as environment_exact,
      (effective.my_environments && effective.their_environments) as environment_overlap,
      (effective.my_group_sizes && effective.their_group_sizes) as group_overlap,
      (effective.my_languages && effective.their_languages) as language_overlap,
      (effective.my_saturday = effective.their_saturday) as saturday_same,

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

      /* Ratings received by the candidate, from anyone. */
      public.app_positive_rating_count(effective.candidate_id) as their_positive_ratings,

      /*
       * A negative rating in either direction. No longer a filter — see the
       * multiplier at the bottom and the note in the migration header.
       */
      exists (
        select 1
        from public.study_ratings r
        where r.sentiment = 'negative'
          and (
            (r.rater_id = effective.my_id and r.ratee_id = effective.candidate_id)
            or (r.rater_id = effective.candidate_id and r.ratee_id = effective.my_id)
          )
      ) as negatively_rated,

      /* How much the two of them actually talk to each other, 0 upwards. */
      public.app_engagement_points(effective.my_id, effective.candidate_id)
        as engagement_points,

      public.app_array_jaccard(effective.my_time_blocks, effective.their_time_blocks)
        as hours_jaccard
    from effective
    join public.profiles candidate on candidate.id = effective.candidate_id
    left join public.degrees candidate_degree on candidate_degree.id = candidate.degree_id
    where
      candidate.university_id = effective.my_university_id
      and candidate.is_discoverable
      and candidate.onboarding_completed_at is not null
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
        + least(measured.overlap_minutes, 480)::numeric / 480 * 18
        + least(3 + (measured.shared_course_count - 1) * 3, 9)
        + case when measured.language_overlap then 4 else 0 end
        + case when measured.group_overlap then 2 else 0 end
        + case when measured.saturday_same then 2 else 0 end
      ) as core_raw,
      /*
       * BONUSES, now out of 21.
       *
       * Reputation is worth up to 6, saturating at three positive ratings — a
       * bonus rather than a multiplier, because a well-regarded classmate who is
       * never free when you are is still a bad match. The cap keeps the earlier
       * ordering rule intact: nothing here can climb over the hours term.
       */
      (
        case when measured.same_city then 6 else 0 end
        + case when measured.close_in_age then 5 else 0 end
        + case when measured.same_cohort then 4 else 0 end
        + least(measured.their_positive_ratings, 3) * 2
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
        (
          case when scored.hours_overlap then scored.core_raw else scored.core_raw * 0.5 end
          + scored.bonus_points
        )
        /*
         * BOTH ADJUSTMENTS ARE MULTIPLIERS, applied to the finished score rather
         * than added to it. That is what keeps them honest in opposite
         * directions: engagement cannot manufacture a match out of nothing,
         * because anything times a zero base is still zero; and a negative
         * rating cannot be out-earned by piling on bonuses, because it scales
         * whatever the total happens to be.
         */
        * case when scored.negatively_rated then 0.75 else 1 end
        * (1 + least(scored.engagement_points::numeric / 100, 0.15))
      ),
      1
    ) as rule_score
  from scored
  order by rule_score desc, scored.overlap_minutes desc, scored.full_name
  limit greatest(p_limit, 1);
$$;

comment on function public.rpc_find_candidates is
  'Ranked study-partner candidates, v5. Preferences resolve per course; study format is a strict filter; disjoint hours halve the score; positive ratings add up to 6 bonus points. A negative rating in either direction now multiplies the score by 0.75 rather than excluding the pair — blocking is what excludes. Social engagement between the pair multiplies by up to 1.15, capped so it can only reorder candidates who already scored.';

revoke execute on function public.rpc_find_candidates(uuid, int) from public;
grant execute on function public.rpc_find_candidates(uuid, int) to authenticated;

-- -----------------------------------------------------------------------------
-- Transitive suggestions: same bar as a match
-- -----------------------------------------------------------------------------

create or replace function public.rpc_sync_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$

declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return;
  end if;

  insert into public.notifications (recipient_id, type, actor_id, occurred_on)
  select v_me, 'birthday', pp.profile_id, current_date
  from public.profile_private pp
  where pp.date_of_birth is not null
    and extract(month from pp.date_of_birth) = extract(month from current_date)
    and extract(day from pp.date_of_birth) = extract(day from current_date)
    and pp.profile_id <> v_me
    and public.app_is_connection(v_me, pp.profile_id)
  on conflict do nothing;

  insert into public.notifications (recipient_id, type, actor_id, course_offering_id)
  select v_me, 'new_match', c.candidate_id, c.course_offering_id
  from public.rpc_find_candidates(null, 20) c
  where c.rule_score >= 70
  on conflict do nothing;

  /*
   * SOMEONE YOU SHOULD MEET, reachable through someone you both know.
   *
   * `distinct on (other.id)` because the same person can be reachable through
   * several mutual connections. One suggestion per person; which bridge it came
   * through is whichever the ordering settles on, and all of them are true.
   *
   * THE CANDIDATE LIST IS THE GATE. This used to join enrollments to enrollments
   * directly, with no term filter — so a course shared in a term that ended a
   * year ago was enough to introduce two people, and the resulting card said
   * "no compatibility score" because rpc_find_candidates counts only current
   * terms and had nothing for the pair. Joining the candidate list instead means
   * a suggestion cannot exist unless the pair would already have appeared as a
   * match, at a score above zero. One definition of "these two could study
   * together", shared by both features.
   *
   * The limit is generous because this is a filter, not a feed: someone worth
   * introducing may sit well down the caller's own ranking.
   */
  insert into public.notifications
    (recipient_id, type, actor_id, secondary_id, course_offering_id)
  select distinct on (other.id)
    v_me,
    'match_suggestion',
    other.id,
    bridge.id,
    candidate.course_offering_id
  from public.rpc_find_candidates(null, 200) candidate
  join public.profiles other
    on other.id = candidate.candidate_id
  /* The mutual connection this suggestion travels along. */
  join public.profiles bridge
    on bridge.id <> v_me
   and bridge.id <> other.id
   and public.app_is_connection(v_me, bridge.id)
   and public.app_is_connection(bridge.id, other.id)
  where
    /*
     * The threshold. rpc_find_candidates already requires a current-term shared
     * course, compatible study formats, no block and no live connection request;
     * this adds "and the result was actually worth something".
     */
    candidate.rule_score > 0
    /* Already know each other — there is nothing to introduce. */
    and not public.app_is_connection(v_me, other.id)
    /*
     * Both discoverable. Turning discovery off is a student saying "leave me out
     * of matching", and that has to cut both ways: they are not suggested to
     * anyone, and nobody is suggested to them.
     */
    and other.is_discoverable
    and exists (
      select 1 from public.profiles me
      where me.id = v_me and me.is_discoverable
    )
    and public.app_overlap_minutes(v_me, other.id) >= 120
  on conflict do nothing;

  /*
   * RATE THE PEOPLE YOU STUDIED WITH.
   *
   * One row per person the caller finished a meeting with and has not rated. The
   * `not exists` is what stops the prompt outliving its usefulness: once they
   * answer, it stops being offered.
   */
  insert into public.notifications (recipient_id, type, actor_id, meeting_id, occurred_on)
  select
    v_me,
    'rate_partner',
    theirs.profile_id,
    m.id,
    (m.ends_at at time zone 'UTC')::date
  from public.meeting_attendees mine
  join public.meetings m
    on m.id = mine.meeting_id
  join public.meeting_attendees theirs
    on theirs.meeting_id = mine.meeting_id
   and theirs.profile_id <> mine.profile_id
  where mine.profile_id = v_me
    and mine.rsvp = 'going'
    and theirs.rsvp = 'going'
    and m.status = 'scheduled'
    and m.ends_at <= now()
    /* Already said their piece — do not ask again. */
    and not exists (
      select 1
      from public.study_ratings r
      where r.rater_id = v_me
        and r.ratee_id = theirs.profile_id
    )
  on conflict do nothing;
end;

$$;

revoke execute on function public.rpc_sync_notifications() from public;
grant execute on function public.rpc_sync_notifications() to authenticated;
