-- =============================================================================
-- File:        supabase/migrations/20260812130000_nested_comments_and_social_notifications.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Phase 8D — replies, comment likes, and the notifications every
--              social act now raises.
--
--              WHY THE TRIGGERS ARE THE WHOLE FEATURE. Phase 8A decided that a
--              notification is written where the event happens, never by the
--              application: a feed a client can write to is a feed that can lie,
--              and an application path that forgets to notify is a bug nobody
--              sees. Everything below follows from that — eight events, eight
--              triggers, no server action anywhere.
--
--              THE SELF-NOTIFICATION RULE, and why it is a WHERE and not a
--              CHECK. notifications_no_self already refuses a row whose actor is
--              its recipient — but a refused row would raise, and these triggers
--              run inside the INSERT that caused them. Liking your own post would
--              fail to save the like. So every trigger FILTERS instead: it
--              declines to write rather than being told off for writing.
--
--              ONE LEVEL OF REPLIES. A reply's parent must be a top-level
--              comment, for the same reason a share cannot be shared: by the
--              third level nobody can tell who is answering whom, and the reply
--              notification stops naming the right person.
-- Version:     0.22.0
--
-- Modifications:
--     0.22.0 - 2026-08-12 - Nested comments, comment likes, social triggers
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part 1: nested replies
-- -----------------------------------------------------------------------------

alter table post_comments
  add column parent_comment_id uuid references post_comments (id) on delete cascade;

comment on column post_comments.parent_comment_id is
  'The comment this one answers. Null for a top-level comment. Cascades: deleting a comment takes its replies, which is what a thread means.';

create index post_comments_parent_idx
  on post_comments (parent_comment_id)
  where parent_comment_id is not null;

-- A reply belongs to the same post as its parent, and its parent is top level.
--
-- Neither can be a CHECK: both read another row. The first rule stops a reply
-- being attached to a comment on a different post — which would make it visible
-- to the wrong audience, since visibility is decided by the post.
create or replace function public.check_comment_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_post   uuid;
  v_parent_parent uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  if new.parent_comment_id = new.id then
    raise exception 'A comment cannot reply to itself.' using errcode = '23514';
  end if;

  select c.post_id, c.parent_comment_id
  into v_parent_post, v_parent_parent
  from public.post_comments c
  where c.id = new.parent_comment_id;

  if v_parent_post is null then
    raise exception 'That comment no longer exists.' using errcode = '23503';
  end if;

  if v_parent_post <> new.post_id then
    raise exception 'A reply must be on the same post as the comment it answers.'
      using errcode = '23514';
  end if;

  if v_parent_parent is not null then
    raise exception 'Reply to the original comment rather than to a reply.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger post_comments_check_reply
  before insert or update on public.post_comments
  for each row execute function public.check_comment_reply();

-- -----------------------------------------------------------------------------
-- Part 1: likes on comments
-- -----------------------------------------------------------------------------

create table comment_likes (
  comment_id uuid not null references post_comments (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One like per person per comment, by the key rather than by the button.
  primary key (comment_id, profile_id)
);

comment on table comment_likes is
  'One row per person per comment. Visible to whoever may see the post the comment sits under — the same rule as the comment itself.';

create index comment_likes_comment_idx on comment_likes (comment_id);

-- Whether the caller may see the post a comment belongs to.
--
-- Wraps app_can_see_wall_post so the share rule — connected to BOTH ends — is
-- stated once and reached from here too. Without it a like on a comment would be
-- a side channel confirming a shared post the caller may not read.
create or replace function public.app_can_see_comment(target_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.post_comments c
    where c.id = target_comment_id
      and public.app_can_see_wall_post(c.post_id)
  );
$$;

revoke execute on function public.app_can_see_comment(uuid) from public;
grant execute on function public.app_can_see_comment(uuid) to authenticated;

grant all privileges on public.comment_likes to service_role;
-- No UPDATE: a like is on or off.
grant select, insert, delete on public.comment_likes to authenticated;

alter table comment_likes enable row level security;

create policy "comment likes are as visible as the comment"
  on public.comment_likes for select to authenticated
  using (public.app_can_see_comment(comment_id));

create policy "you can like a comment you can see"
  on public.comment_likes for insert to authenticated
  with check (profile_id = auth.uid() and public.app_can_see_comment(comment_id));

create policy "you can take back your own comment like"
  on public.comment_likes for delete to authenticated
  using (profile_id = auth.uid());

alter publication supabase_realtime add table public.comment_likes;

-- -----------------------------------------------------------------------------
-- Part 2: what a notification can now point at
-- -----------------------------------------------------------------------------

alter table notifications
  add column wall_post_id uuid references wall_posts (id) on delete cascade,
  add column comment_id   uuid references post_comments (id) on delete cascade;

comment on column notifications.wall_post_id is
  'The post the notification is about. Cascades, like actor_id: a notification about a deleted post is not a fact.';

-- The subject rule, extended.
--
-- WORTH KNOWING WHY THIS HAD TO CHANGE AT ALL: the old constraint was a CASE
-- with no ELSE, so a type it did not mention produced NULL — and a CHECK that
-- evaluates to NULL passes. Every new type would have slipped through silently.
alter table notifications drop constraint notifications_has_its_subject;

alter table notifications
  add constraint notifications_has_its_subject check (
    case type
      when 'group_request'     then group_id is not null and actor_id is not null
      when 'group_promotion'   then group_id is not null
      when 'group_invite'      then group_id is not null and actor_id is not null
      when 'meeting_scheduled' then meeting_id is not null
      when 'meeting_cancelled' then meeting_id is not null
      when 'rate_partner'      then meeting_id is not null and actor_id is not null
      when 'new_match'         then actor_id is not null
      when 'birthday'          then actor_id is not null
      when 'match_suggestion'  then actor_id is not null and secondary_id is not null
      when 'wall_post'         then wall_post_id is not null and actor_id is not null
      when 'post_like'         then wall_post_id is not null and actor_id is not null
      when 'post_comment'      then wall_post_id is not null and actor_id is not null
      when 'post_share'        then wall_post_id is not null and actor_id is not null
      when 'comment_reply'     then comment_id is not null and actor_id is not null
      when 'comment_like'      then comment_id is not null and actor_id is not null
      -- No ELSE by design: a type added later with no arm here fails loudly the
      -- first time it is used, rather than quietly skipping its own rule.
      else false
    end
  );

-- One rate-partner prompt per meeting per person, however often the feed syncs.
create unique index notifications_rate_partner_once_idx
  on notifications (recipient_id, meeting_id, actor_id)
  where type = 'rate_partner';

-- -----------------------------------------------------------------------------
-- Part 2: the triggers
-- -----------------------------------------------------------------------------

-- 1. Someone wrote on your wall.
--
-- Fires only for an ORIGINAL post: a share is a different event with a different
-- audience, and it gets its own trigger below.
create or replace function public.notify_wall_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.original_post_id is not null then
    return new;
  end if;

  /* Writing on your own wall notifies nobody. */
  if new.author_id is null or new.author_id = new.profile_owner_id then
    return new;
  end if;

  insert into public.notifications (recipient_id, type, actor_id, wall_post_id)
  values (new.profile_owner_id, 'wall_post', new.author_id, new.id);

  return new;
end;
$$;

create trigger wall_posts_notify_post
  after insert on public.wall_posts
  for each row execute function public.notify_wall_post();

-- 2. Someone shared your post.
--
-- The recipient is whoever WROTE the original, not whoever owns the wall it sat
-- on: the words are what was passed along.
create or replace function public.notify_post_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original_author uuid;
begin
  if new.original_post_id is null then
    return new;
  end if;

  select p.author_id into v_original_author
  from public.wall_posts p
  where p.id = new.original_post_id;

  if v_original_author is null
     or new.author_id is null
     or v_original_author = new.author_id then
    return new;
  end if;

  insert into public.notifications (recipient_id, type, actor_id, wall_post_id)
  values (v_original_author, 'post_share', new.author_id, new.original_post_id);

  return new;
end;
$$;

create trigger wall_posts_notify_share
  after insert on public.wall_posts
  for each row execute function public.notify_post_share();

-- 3. Someone liked your post.
create or replace function public.notify_post_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  select p.author_id into v_author
  from public.wall_posts p
  where p.id = new.post_id;

  if v_author is null or v_author = new.profile_id then
    return new;
  end if;

  insert into public.notifications (recipient_id, type, actor_id, wall_post_id)
  values (v_author, 'post_like', new.profile_id, new.post_id);

  return new;
end;
$$;

create trigger post_likes_notify
  after insert on public.post_likes
  for each row execute function public.notify_post_like();

-- 4 and 6. A comment, or a reply to one.
--
-- ONE TRIGGER FOR BOTH, because they are the same act with a different audience:
-- a top-level comment answers the post and tells its author; a reply answers a
-- person and tells them instead. Splitting them would duplicate the lookup and
-- invite the two to drift.
create or replace function public.notify_post_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient  uuid;
  v_type       public.notification_type;
begin
  if new.author_id is null then
    return new;
  end if;

  if new.parent_comment_id is null then
    select p.author_id into v_recipient
    from public.wall_posts p
    where p.id = new.post_id;

    v_type := 'post_comment';
  else
    select c.author_id into v_recipient
    from public.post_comments c
    where c.id = new.parent_comment_id;

    v_type := 'comment_reply';
  end if;

  if v_recipient is null or v_recipient = new.author_id then
    return new;
  end if;

  insert into public.notifications
    (recipient_id, type, actor_id, wall_post_id, comment_id)
  values (
    v_recipient,
    v_type,
    new.author_id,
    case when v_type = 'post_comment' then new.post_id else null end,
    case when v_type = 'comment_reply' then new.id else null end
  );

  return new;
end;
$$;

create trigger post_comments_notify
  after insert on public.post_comments
  for each row execute function public.notify_post_comment();

-- 5. Someone liked your comment.
create or replace function public.notify_comment_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
begin
  select c.author_id into v_author
  from public.post_comments c
  where c.id = new.comment_id;

  if v_author is null or v_author = new.profile_id then
    return new;
  end if;

  insert into public.notifications (recipient_id, type, actor_id, comment_id)
  values (v_author, 'comment_like', new.profile_id, new.comment_id);

  return new;
end;
$$;

create trigger comment_likes_notify
  after insert on public.comment_likes
  for each row execute function public.notify_comment_like();

-- 7. An admin invited you to a group.
--
-- The row is a group_request with kind = 'invite', whose requester_id is the
-- student being invited — the direction that trips people up, and the reason the
-- feed queries filter on kind. Phase 8A's notify_group_request deliberately
-- ignores invites; this is their half.
create or replace function public.notify_group_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'invite' or new.status <> 'pending' then
    return new;
  end if;

  if new.invited_by is null or new.invited_by = new.requester_id then
    return new;
  end if;

  insert into public.notifications (recipient_id, type, actor_id, group_id)
  values (new.requester_id, 'group_invite', new.invited_by, new.group_id);

  return new;
end;
$$;

create trigger group_requests_notify_invite
  after insert on public.group_requests
  for each row execute function public.notify_group_invite();

-- -----------------------------------------------------------------------------
-- 8. "Rate the people you studied with"
-- -----------------------------------------------------------------------------

-- NOT A TRIGGER, AND IT CANNOT BE ONE. A meeting does not change when it ends —
-- time passes and no row is written, so there is nothing to fire on. Adding a
-- `finished` status would only move the question to whatever sets it, which is
-- the same problem wearing a hat.
--
-- So it joins birthdays and match suggestions as a DERIVED notification, made
-- idempotent by the unique index above rather than by remembering. Phase 8A
-- built that path for exactly this shape of fact.
--
-- One prompt per person you actually sat with: the pair rule is the same one
-- app_shared_completed_meeting enforces for the rating itself, so the feed can
-- never offer a prompt the database would then refuse.
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
    and public.app_overlap_minutes(a.id, b.id) >= 120
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
  'Materialises the notifications with no event behind them — birthdays, strong new matches, suggestions between connections, and the prompt to rate someone you have just finished studying with. Idempotent through partial unique indexes, so the feed calls it on every open.';
