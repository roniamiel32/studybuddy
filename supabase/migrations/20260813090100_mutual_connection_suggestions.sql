-- =============================================================================
-- File:        supabase/migrations/20260813090100_mutual_connection_suggestions.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: A suggestion goes to the people who should meet, not to the
--              person who already knows them both.
--
--              THE BUG, PLAINLY. Phase 8A built match_suggestion around the
--              bridge: for every pair of the caller's connections who were not
--              connected to each other, it wrote ONE notification, to the
--              caller, saying "Lian and Tamar could study well together". Sheli
--              — who already knows both — was told about a meeting she has no
--              part in, and Lian and Tamar were told nothing at all. The
--              introduction was addressed to the one person who did not need it.
--
--              WHAT REPLACES IT. Each student's own sync now looks for people
--              they should meet: someone reachable through a shared connection,
--              not yet connected to them, sharing a course and enough free time.
--              The row is addressed to them, about that person.
--
--              WHY BOTH SIDES STILL GET ONE, without this function ever writing
--              to somebody else's feed. The relation is symmetric: if Lian is
--              reachable from Tamar through Sheli, then Tamar is reachable from
--              Lian through Sheli. So Lian's sync writes Lian's notification and
--              Tamar's sync writes Tamar's, each from their own side. Writing
--              both rows from the bridge's sync would have been the shorter
--              patch and the wrong shape: notifications would then appear only
--              if the bridge happened to open the app, and one student's page
--              load would be silently filling two other students' feeds.
--
--              THE BRIDGE IS KEPT IN secondary_id. It is not named in the copy —
--              "you share a mutual study connection" is the whole point, and
--              which one is not the reader's business to be told unprompted —
--              but the column is what the notifications_has_its_subject check
--              requires, and it is the evidence for why the row exists.
-- Version:     0.24.0
--
-- Modifications:
--     0.24.0 - 2026-08-13 - Suggestions address the pair, not the bridge
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part 1: one suggestion per person suggested
-- -----------------------------------------------------------------------------

-- The old index keyed on the unordered pair {actor, secondary}. That was right
-- when the two were the people being introduced; now secondary is the bridge, so
-- the same suggestion arriving through a second mutual friend would key
-- differently and land in the feed twice.
--
-- One row per (recipient, person suggested), whichever bridge produced it.
drop index if exists notifications_suggestion_once_per_pair_idx;

create unique index notifications_suggestion_once_per_person_idx
  on notifications (recipient_id, actor_id)
  where type = 'match_suggestion';

-- -----------------------------------------------------------------------------
-- Part 2: the ones already sent
-- -----------------------------------------------------------------------------

-- Every existing match_suggestion is addressed to the wrong person and reads
-- with the old wording. They are derived rows with no event behind them, so
-- deleting them loses nothing that cannot be rebuilt: the next sync writes the
-- correct ones, addressed correctly, for both sides.
delete from notifications where type = 'match_suggestion';

-- -----------------------------------------------------------------------------
-- Part 3: the sync
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
   * several mutual connections and through several shared courses. One
   * suggestion per person; which bridge and which course it came through is
   * whichever the ordering settles on, and both are true.
   */
  insert into public.notifications
    (recipient_id, type, actor_id, secondary_id, course_offering_id)
  select distinct on (other.id)
    v_me,
    'match_suggestion',
    other.id,
    bridge.id,
    mine.course_offering_id
  from public.profiles other
  /* The mutual connection this suggestion travels along. */
  join public.profiles bridge
    on bridge.id <> v_me
   and bridge.id <> other.id
   and public.app_is_connection(v_me, bridge.id)
   and public.app_is_connection(bridge.id, other.id)
  /* A course in common, which is what makes studying together plausible. */
  join public.enrollments mine
    on mine.profile_id = v_me
  join public.enrollments theirs
    on theirs.profile_id = other.id
   and theirs.course_offering_id = mine.course_offering_id
  where other.id <> v_me
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

comment on function public.rpc_sync_notifications is
  'Materialises the notifications with no event behind them — birthdays, strong new matches, people reachable through a mutual study connection, and the prompt to rate someone you have just finished studying with. Every row it writes is addressed to the caller: a suggestion goes to the person who should act on it, never to the mutual friend who introduced them. Idempotent through partial unique indexes, so the feed calls it on every open.';
