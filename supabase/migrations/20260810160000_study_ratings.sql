-- =============================================================================
-- File:        supabase/migrations/20260810160000_study_ratings.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Phase 6 — post-session ratings, and the profile's age field.
--
--              ONE TABLE, TWO COMPLETELY DIFFERENT PRIVACY RULES, and that
--              asymmetry is the whole design:
--
--                POSITIVE is public. "Studied together" appears on the rated
--                student's profile, naming the person who said so, and raises
--                their score with everyone.
--
--                NEGATIVE is private to its author. Nobody else can read it — not
--                the person rated, not a classmate, not another rater. It exists
--                only to stop the pair being matched again.
--
--              WHY THE ASYMMETRY IS ENFORCED IN SQL AND NOT IN A QUERY. "Only
--              positive connections are publicly displayed" is a promise to the
--              person being rated, and a promise that lives in a WHERE clause is
--              one refactor away from being broken silently. The SELECT policy
--              below cannot return a negative row to anyone but its author, so no
--              query, view, API route or future feature can leak one by accident.
--
--              The score effect is deliberately NOT stored on the rated profile.
--              A denormalised "reputation" column would be a second copy of
--              something these rows already say, and the matching function has to
--              read them anyway to apply the exclusion.
-- Version:     0.18.0
--
-- Modifications:
--     0.18.0 - 2026-08-10 - Initial schema (Phase 6)
-- =============================================================================

create type rating_sentiment as enum ('positive', 'negative');

comment on type rating_sentiment is
  'positive is public and boosts the score; negative is private to its author and prevents future matching. There is deliberately no neutral: a rating nobody acts on is a question we should not be asking.';

create table study_ratings (
  id         uuid primary key default gen_random_uuid(),
  rater_id   uuid not null references profiles (id) on delete cascade,
  ratee_id   uuid not null references profiles (id) on delete cascade,
  sentiment  rating_sentiment not null,
  -- Optional, and PRIVATE in both directions: it is the rater's note to the
  -- system, never shown to the person rated. A public free-text field attached
  -- to a person's name is a review site, which this is not.
  note       text check (char_length(note) <= 500),
  -- The course they studied for, when the rating came from a course context.
  course_offering_id uuid references course_offerings (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_ratings_no_self check (rater_id <> ratee_id)
);

comment on table study_ratings is
  'One row per rater per ratee. Positive rows are public on the ratee''s profile; negative rows are readable only by their author and are used to exclude the pair from matching.';

comment on column study_ratings.note is
  'Private to the rater in both directions. Never rendered on the rated student''s profile.';

-- One rating per pair, DIRECTIONAL. A and B each get their own say, and changing
-- your mind updates the row rather than adding a second.
create unique index study_ratings_one_per_pair_idx
  on study_ratings (rater_id, ratee_id);

-- The profile reads "positive ratings about this person".
create index study_ratings_ratee_sentiment_idx on study_ratings (ratee_id, sentiment);

-- Matching reads "my negative ratings" to exclude them.
create index study_ratings_rater_sentiment_idx on study_ratings (rater_id, sentiment);

-- -----------------------------------------------------------------------------
-- Age, without the birth date
-- -----------------------------------------------------------------------------

-- A student's age in whole years, or null when they withheld a date of birth.
--
-- SECURITY DEFINER because date_of_birth lives in profile_private, readable only
-- by its owner. This function returns the AGE and never the date, the same trade
-- app_age_gap_years already makes for the matching bonus.
--
-- THIS IS A DELIBERATE DISCLOSURE, and worth naming: the schema put the birth date
-- in a separate table specifically so classmates could not read it, and showing an
-- age on a profile discloses more than a gap does. It is what the profile
-- specification asks for, it is what a student would expect a profile to show, and
-- a year is much less identifying than a date. The date itself still never leaves
-- the database.
create or replace function public.app_profile_age_years(target_profile_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when pp.date_of_birth is null then null
           else extract(year from age(pp.date_of_birth))::int
         end
  from public.profile_private pp
  where pp.profile_id = target_profile_id
    -- The visibility gate: only for students the caller may see at all. Without
    -- this, the function would report the age of anyone whose id you could guess,
    -- at any university.
    and (
      target_profile_id = auth.uid()
      or public.app_can_see_profile(target_profile_id)
    );
$$;

comment on function public.app_profile_age_years is
  'Age in whole years for a student the caller may see, or null. Returns only the age; the birth date never leaves the database.';

revoke execute on function public.app_profile_age_years(uuid) from public;
grant execute on function public.app_profile_age_years(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Keeping updated_at honest
-- -----------------------------------------------------------------------------

create or replace function public.touch_study_rating()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;

  return new;
end;
$$;

create trigger study_ratings_touch
  before update on public.study_ratings
  for each row execute function public.touch_study_rating();

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------

grant all privileges on public.study_ratings to service_role;

-- DELETE is allowed: withdrawing a rating you gave is different from editing
-- someone's history, and a student who rated in anger should be able to take it
-- back rather than being told to flip it to positive.
grant select, insert, update, delete on public.study_ratings to authenticated;

-- -----------------------------------------------------------------------------
-- RLS — the asymmetry
-- -----------------------------------------------------------------------------

alter table study_ratings enable row level security;

-- THE RULE THE WHOLE FEATURE RESTS ON.
--
-- You may read a rating if you wrote it, OR if it is positive and about a student
-- you can see. A negative row is therefore invisible to the person it is about,
-- to their classmates, and to anyone else — its author is the only reader.
--
-- Note what this does NOT say: there is no clause admitting the ratee to their own
-- negative ratings. That is the point. Telling someone "a partner rated you
-- negatively" turns a quiet matching signal into a social wound, and the
-- specification asks for it to stay hidden.
create policy "positive ratings are public, negative ones are the author's alone"
  on public.study_ratings for select to authenticated
  using (
    rater_id = auth.uid()
    or (sentiment = 'positive' and public.app_can_see_profile(ratee_id))
  );

-- Only as yourself, and only about someone you have actually talked to.
--
-- The conversation requirement is what stops this becoming a drive-by rating
-- system: a student can only rate a person they have a thread with, which in this
-- app means someone they pressed "Send message" on and exchanged words with.
create policy "you can rate someone you have talked to"
  on public.study_ratings for insert to authenticated
  with check (
    rater_id = auth.uid()
    and ratee_id <> auth.uid()
    and public.app_can_see_profile(ratee_id)
    and exists (
      select 1
      from public.conversations c
      where auth.uid() in (c.participant_a, c.participant_b)
        and study_ratings.ratee_id in (c.participant_a, c.participant_b)
    )
  );

-- You can change your own mind, and only your own.
create policy "you can change a rating you gave"
  on public.study_ratings for update to authenticated
  using (rater_id = auth.uid())
  with check (rater_id = auth.uid());

create policy "you can withdraw a rating you gave"
  on public.study_ratings for delete to authenticated
  using (rater_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Matching: positive boosts, negative excludes
-- -----------------------------------------------------------------------------

-- How many students have rated this one positively.
--
-- SECURITY DEFINER because the matching function is, and because a count of
-- public rows discloses nothing the profile does not already show.
create or replace function public.app_positive_rating_count(target_profile_id uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.study_ratings r
  where r.ratee_id = target_profile_id
    and r.sentiment = 'positive';
$$;

comment on function public.app_positive_rating_count is
  'Positive ratings received. Feeds the matching bonus and the profile badge.';

revoke execute on function public.app_positive_rating_count(uuid) from public;
grant execute on function public.app_positive_rating_count(uuid) to authenticated;

-- Matching v4: the same function, plus two effects from ratings.
--
--   EXCLUSION. A negative rating in EITHER direction removes the pair from each
--   other's candidates, exactly as a block does. Symmetric on purpose: the person
--   who was rated badly is not told, but they also should not keep being shown
--   someone who has quietly opted out of them.
--
--   BOOST. Positive ratings add up to 6 points, saturating at three. It is a
--   bonus and not a multiplier: a well-regarded classmate who is never free at the
--   same time as you is still a bad match, and no amount of reputation should
--   climb over the hours term.
--
-- Same signature and return type, so nothing that calls it changes.
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
      /*
       * NEGATIVE RATINGS EXCLUDE, in either direction.
       *
       * Symmetric deliberately. The student who was rated badly is never told —
       * that is the privacy rule — but they should not keep being shown someone who
       * has quietly opted out of them either, and a one-directional exclusion would
       * leave exactly that: one of the pair still seeing the other every day.
       */
      and not exists (
        select 1
        from public.study_ratings r
        where r.sentiment = 'negative'
          and (
            (r.rater_id = effective.my_id and r.ratee_id = effective.candidate_id)
            or (r.rater_id = effective.candidate_id and r.ratee_id = effective.my_id)
          )
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
  'Ranked study-partner candidates, v4. Preferences resolve per course; study format is a strict filter; disjoint hours halve the score; a negative rating in either direction excludes the pair entirely; positive ratings add up to 6 bonus points, saturating at three.';

revoke execute on function public.rpc_find_candidates(uuid, int) from public;
grant execute on function public.rpc_find_candidates(uuid, int) to authenticated;
