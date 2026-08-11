-- =============================================================================
-- File:        supabase/migrations/20260811130000_verified_ratings.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Phase 7D — you can only rate someone you actually met.
--
--              THE RULE CHANGES. Phase 6 required a conversation: "someone you
--              pressed Send message on". That was the strongest evidence the
--              schema had. Phase 7C created better evidence, so the rule moves to
--              it: a meeting, in the past, that BOTH of you attended and NEITHER
--              of you cancelled.
--
--              WHY THIS IS A TRIGGER AND NOT ONLY A POLICY. The requirement is
--              that it be impossible, and RLS cannot deliver impossible on its
--              own:
--
--                1. THE UPDATE POLICY WAS ALREADY A HOLE. Phase 6 grants UPDATE
--                   on `using (rater_id = auth.uid())` and checks nothing else —
--                   so anyone holding one legitimate rating could repoint its
--                   ratee_id at a stranger. A new INSERT policy would not have
--                   touched that path. This migration freezes both ids and
--                   re-checks the rule on every update.
--                2. RLS DOES NOT APPLY TO service_role, which is what server
--                   actions holding the service key, seed scripts and any future
--                   admin tool run as.
--                3. A policy is checked against the row a writer NAMES. A trigger
--                   is checked against the row that is actually stored.
--
--              So the rule is written twice, deliberately: once as a policy, so a
--              student gets a clean permission error, and once as a trigger, so
--              there is no path around it. The trigger does NOT exempt
--              service_role — unlike freeze_group_request, which does so support
--              tooling can rescue a stuck request. Here the requirement is that
--              no path exists, and nothing in the seed writes ratings, so there is
--              nothing to grandfather.
--
--              RATINGS STAY ONE PER PAIR. meeting_id is added as provenance only.
--              Making them per-meeting would let one enthusiastic partner file
--              five positive ratings across five sessions into a matching bonus
--              that saturates at three, and would mean rewriting the unique index
--              §15 depends on.
-- Version:     0.19.0
--
-- Modifications:
--     0.19.0 - 2026-08-11 - Initial schema (Phase 7D)
-- =============================================================================

-- Which session prompted the rating. Nullable: rows written before Phase 7C have
-- no meeting to point at, and `set null` because losing the meeting must not
-- delete somebody's reputation.
alter table study_ratings
  add column meeting_id uuid references meetings (id) on delete set null;

comment on column study_ratings.meeting_id is
  'Provenance only — which session prompted this. The rating is still one row per pair; a later meeting updates it rather than adding a second.';

-- -----------------------------------------------------------------------------
-- The predicate
-- -----------------------------------------------------------------------------

-- Whether these two students have finished a meeting together that neither of
-- them pulled out of.
--
-- ends_at rather than starts_at: the session is over, not merely begun. Rating
-- someone twenty minutes into a two-hour session is rating an intention.
--
-- SECURITY DEFINER because it is called from a policy and from a trigger, and
-- must give the same answer in both — it reads meeting_attendees rows belonging
-- to the other student, which the caller cannot select directly.
create or replace function public.app_shared_completed_meeting(
  profile_a uuid,
  profile_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.meeting_attendees mine
    join public.meeting_attendees theirs
      on theirs.meeting_id = mine.meeting_id
    join public.meetings m
      on m.id = mine.meeting_id
    where mine.profile_id = profile_a
      and theirs.profile_id = profile_b
      and mine.rsvp = 'going'
      and theirs.rsvp = 'going'
      -- A session that was called off is not a session anyone attended.
      and m.status = 'scheduled'
      and m.ends_at <= now()
  );
$$;

comment on function public.app_shared_completed_meeting is
  'True when both students attended the same finished meeting and neither cancelled. The whole of the Phase 7D rating rule; the freeze on meeting_attendees.rsvp is what stops it being gamed after the fact.';

revoke execute on function public.app_shared_completed_meeting(uuid, uuid) from public;
grant execute on function public.app_shared_completed_meeting(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Enforcement
-- -----------------------------------------------------------------------------

create or replace function public.check_rating_has_shared_meeting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- meeting_id is `on delete set null`, so deleting a meeting makes PostgreSQL
  -- run `update study_ratings set meeting_id = null` on every rating that names
  -- it. Re-verifying here would consult a meeting that no longer exists, refuse,
  -- and take the meeting deletion down with it. Losing the provenance is not a
  -- change to the rating, so there is nothing to re-verify — and the pair's
  -- history is checked again the moment anything they actually said changes.
  if tg_op = 'UPDATE'
     and new.meeting_id is null
     and old.meeting_id is not null
     and new.sentiment is not distinct from old.sentiment
     and new.note is not distinct from old.note then
    return new;
  end if;

  if not public.app_shared_completed_meeting(new.rater_id, new.ratee_id) then
    raise exception 'You can only rate someone after a meeting you both attended.'
      using errcode = '42501';
  end if;

  -- When a meeting is named, it has to be one they were both actually at —
  -- otherwise the provenance would be free text with a foreign key on it.
  if new.meeting_id is not null and not exists (
    select 1
    from public.meeting_attendees mine
    join public.meeting_attendees theirs
      on theirs.meeting_id = mine.meeting_id
    where mine.meeting_id = new.meeting_id
      and mine.profile_id = new.rater_id
      and theirs.profile_id = new.ratee_id
      and mine.rsvp = 'going'
      and theirs.rsvp = 'going'
  ) then
    raise exception 'That is not a meeting you both attended.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger study_ratings_require_meeting
  before insert or update on public.study_ratings
  for each row execute function public.check_rating_has_shared_meeting();

-- The two ids join created_at in the frozen set.
--
-- "Changing your mind" means changing the sentiment or the note. Repointing a
-- rating at a different person is not a change of mind, and leaving it possible
-- would have made the whole rule above optional.
create or replace function public.touch_study_rating()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rater_id is distinct from old.rater_id
     or new.ratee_id is distinct from old.ratee_id then
    raise exception 'A rating cannot be reassigned to someone else.'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  new.created_at := old.created_at;

  return new;
end;
$$;

-- The policy, restated on the new evidence. A student gets a clean permission
-- error here; the trigger is what makes it impossible rather than merely refused.
drop policy "you can rate someone you have talked to" on public.study_ratings;

create policy "you can rate someone you have met"
  on public.study_ratings for insert to authenticated
  with check (
    rater_id = auth.uid()
    and ratee_id <> auth.uid()
    and public.app_can_see_profile(ratee_id)
    and public.app_shared_completed_meeting(auth.uid(), ratee_id)
  );

-- -----------------------------------------------------------------------------
-- Rating the group as a whole
-- -----------------------------------------------------------------------------

-- A SEPARATE TABLE, not a nullable ratee_id on study_ratings. That column is
-- `not null`, is half of a unique index, and is read by both the profile page
-- and rpc_find_candidates. Loosening it to fit a third subject in would weaken a
-- constraint two features already depend on.
--
-- PER MEETING, not per group. "How was that session" is a question someone can
-- answer; "how is this group, all time" is a different and much vaguer one, and
-- the meeting is also what makes the rating verifiable.
create table group_meeting_ratings (
  id         uuid primary key default gen_random_uuid(),
  rater_id   uuid not null references profiles (id) on delete cascade,
  group_id   uuid not null references study_groups (id) on delete cascade,
  meeting_id uuid not null references meetings (id) on delete cascade,
  sentiment  rating_sentiment not null,
  -- Private to its author in both directions, exactly as study_ratings.note is.
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rater_id, meeting_id)
);

comment on table group_meeting_ratings is
  'How a session went, as a whole. Positive rows are visible to the group; negative rows are readable only by their author — the same asymmetry study_ratings uses, for the same reason.';

create index group_meeting_ratings_group_idx
  on group_meeting_ratings (group_id, sentiment);

-- The same evidence rule, for the group case: you were at that session, it
-- belongs to that group, and it is over.
create or replace function public.check_group_rating_attendance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.meeting_attendees a
    join public.meetings m on m.id = a.meeting_id
    where a.meeting_id = new.meeting_id
      and a.profile_id = new.rater_id
      and a.rsvp = 'going'
      and m.status = 'scheduled'
      and m.group_id = new.group_id
      and m.ends_at <= now()
  ) then
    raise exception 'You can only rate a session you attended, after it has finished.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger group_meeting_ratings_require_attendance
  before insert or update on public.group_meeting_ratings
  for each row execute function public.check_group_rating_attendance();

create or replace function public.touch_group_meeting_rating()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.rater_id is distinct from old.rater_id
     or new.meeting_id is distinct from old.meeting_id
     or new.group_id is distinct from old.group_id then
    raise exception 'A rating cannot be reassigned.'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  new.created_at := old.created_at;

  return new;
end;
$$;

create trigger group_meeting_ratings_touch
  before update on public.group_meeting_ratings
  for each row execute function public.touch_group_meeting_rating();

grant all privileges on public.group_meeting_ratings to service_role;
grant select, insert, update, delete on public.group_meeting_ratings to authenticated;

alter table group_meeting_ratings enable row level security;

-- The same asymmetry as study_ratings: a positive verdict is shared with the
-- group, a negative one belongs to whoever wrote it and to nobody else.
create policy "positive session ratings are visible to the group"
  on public.group_meeting_ratings for select to authenticated
  using (
    rater_id = auth.uid()
    or (sentiment = 'positive' and public.app_is_group_member(group_id))
  );

create policy "you can rate a session you attended"
  on public.group_meeting_ratings for insert to authenticated
  with check (rater_id = auth.uid());

create policy "you can change a session rating you gave"
  on public.group_meeting_ratings for update to authenticated
  using (rater_id = auth.uid())
  with check (rater_id = auth.uid());

create policy "you can withdraw a session rating you gave"
  on public.group_meeting_ratings for delete to authenticated
  using (rater_id = auth.uid());
