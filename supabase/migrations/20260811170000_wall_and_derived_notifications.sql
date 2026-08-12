-- =============================================================================
-- File:        supabase/migrations/20260811170000_wall_and_derived_notifications.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Phase 8B — the social wall, and the notifications with no event
--              behind them.
--
--              THE WALL'S RULE IS ASYMMETRIC, like the ratings before it:
--              ANYONE who may see the profile may READ it, and only a CONNECTION
--              may WRITE on it. That asymmetry is the feature — a wall nobody can
--              read is a diary, and a wall anyone can write on is a comment
--              section.
--
--              A CONNECTION IS A POSITIVE RATING (§15.5), which since Phase 7D is
--              only earned by finishing a meeting together. So the right to post
--              on someone's wall cannot be self-issued: it is downstream of two
--              people actually turning up.
--
--              THE OWNER CAN DELETE ANYTHING ON THEIR OWN WALL. Not just their
--              own posts — anything. It is their profile, a birthday wish can
--              land badly, and "ask the author to remove it" is not a moderation
--              policy.
-- Version:     0.20.0
--
-- Modifications:
--     0.20.0 - 2026-08-11 - Initial schema (Phase 8B)
-- =============================================================================

create table wall_posts (
  id               uuid primary key default gen_random_uuid(),
  -- Whose wall it is.
  profile_owner_id uuid not null references profiles (id) on delete cascade,
  -- Who wrote it. `set null` rather than cascade: deleting your account should
  -- not silently rewrite other people's walls, the same rule Phase 3 set for
  -- messages and Phase 7 restated for group chat.
  author_id        uuid references profiles (id) on delete set null,
  body             text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table wall_posts is
  'Posts on a student''s profile wall. Readable by anyone who may see the profile; writable only by a connection, which §15.5 defines as a positive rating and Phase 7D made earnable only through a finished meeting.';

comment on column wall_posts.author_id is
  'Null once the author deletes their account. The post stays, rendered as a former student — erasing it would edit somebody else''s wall.';

-- A wall reads newest-first, and nothing else reads this table.
create index wall_posts_owner_recent_idx
  on wall_posts (profile_owner_id, created_at desc);

create or replace function public.touch_wall_post()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.profile_owner_id is distinct from old.profile_owner_id
     or new.author_id is distinct from old.author_id then
    raise exception 'A post cannot be moved to another wall or another author.'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  new.created_at := old.created_at;

  return new;
end;
$$;

create trigger wall_posts_touch
  before update on public.wall_posts
  for each row execute function public.touch_wall_post();

grant all privileges on public.wall_posts to service_role;
grant select, insert, update, delete on public.wall_posts to authenticated;

alter table wall_posts enable row level security;

-- Read: anyone who may see the profile. A wall is the public part of a profile,
-- and app_can_see_profile is already the rule for the rest of it.
create policy "a wall is as visible as the profile it is on"
  on public.wall_posts for select to authenticated
  using (
    profile_owner_id = auth.uid()
    or public.app_can_see_profile(profile_owner_id)
  );

-- Write: your own wall, or a connection's. Never anyone else's.
create policy "you can post on your own wall or a connection's"
  on public.wall_posts for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      profile_owner_id = auth.uid()
      or public.app_is_connection(auth.uid(), profile_owner_id)
    )
  );

-- Edit only your own words. The owner cannot rewrite what someone said on their
-- wall — they can remove it, which is the next policy.
create policy "you can edit a post you wrote"
  on public.wall_posts for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "the author or the wall's owner can remove a post"
  on public.wall_posts for delete to authenticated
  using (author_id = auth.uid() or profile_owner_id = auth.uid());

-- The wall updates live, like the chats do.
alter publication supabase_realtime add table public.wall_posts;

-- -----------------------------------------------------------------------------
-- The notifications with no event behind them
-- -----------------------------------------------------------------------------

-- Materialises today's derived notifications for the caller.
--
-- CALLED WHEN THE FEED OPENS, and safe to call as often as that happens: every
-- insert is guarded by one of the partial unique indexes in 8A, so the second
-- call of the day inserts nothing. That is why this can exist without pg_cron.
--
-- SECURITY DEFINER, and it restates its own scope the way every definer function
-- in this schema does: it only ever writes notifications addressed to auth.uid(),
-- and only about people that student is already connected to or matched with.
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

  /*
   * BIRTHDAYS. Month and day, never the year — the §15.4 promise, restated here
   * rather than assumed, because this function runs with definer rights and
   * could just as easily have read the date.
   */
  insert into public.notifications (recipient_id, type, actor_id, occurred_on)
  select v_me, 'birthday', pp.profile_id, current_date
  from public.profile_private pp
  where pp.date_of_birth is not null
    and extract(month from pp.date_of_birth) = extract(month from current_date)
    and extract(day from pp.date_of_birth) = extract(day from current_date)
    and pp.profile_id <> v_me
    and public.app_is_connection(v_me, pp.profile_id)
  on conflict do nothing;

  /*
   * NEW MATCHES. rpc_find_candidates is the ranking the dashboard already shows;
   * this notifies about the strong ones the student has not been told about yet.
   * The threshold is deliberately high — a feed that fires for every classmate
   * is a feed people turn off.
   */
  insert into public.notifications (recipient_id, type, actor_id, course_offering_id)
  select v_me, 'new_match', c.candidate_id, c.course_offering_id
  from public.rpc_find_candidates(null, 20) c
  where c.rule_score >= 70
  on conflict do nothing;

  /*
   * MATCH SUGGESTIONS between two of the caller's own connections.
   *
   * WHAT A THIRD PARTY MAY SEE, decided deliberately: a shared course and
   * overlapping free hours, both of which each student already publishes to
   * their classmates. No preference data crosses — the caller is being told
   * "these two could study together", not shown either person's answers.
   *
   * Excludes pairs who are already connected, which is the whole point: there is
   * nothing to suggest to two people who have already studied together.
   */
  insert into public.notifications (recipient_id, type, actor_id, secondary_id, course_offering_id)
  select distinct on (least(a.id, b.id), greatest(a.id, b.id))
    v_me, 'match_suggestion', a.id, b.id, ea.course_offering_id
  from public.profiles a
  join public.profiles b on b.id > a.id
  join public.enrollments ea on ea.profile_id = a.id
  join public.enrollments eb
    on eb.profile_id = b.id
   and eb.course_offering_id = ea.course_offering_id
  where public.app_is_connection(v_me, a.id)
    and public.app_is_connection(v_me, b.id)
    and not public.app_is_connection(a.id, b.id)
    and a.id <> v_me
    and b.id <> v_me
    and a.is_discoverable
    and b.is_discoverable
    -- Free hours that actually overlap. Without this the suggestion is "you both
    -- take Algorithms", which the two of them can already see.
    and public.app_overlap_minutes(a.id, b.id) >= 120
  on conflict do nothing;
end;
$$;

comment on function public.rpc_sync_notifications is
  'Materialises the notifications that have no event behind them — birthdays, strong new matches, and suggestions between two of the caller''s connections. Idempotent through the partial unique indexes, so the feed can call it on every open.';

revoke execute on function public.rpc_sync_notifications() from public;
grant execute on function public.rpc_sync_notifications() to authenticated;
