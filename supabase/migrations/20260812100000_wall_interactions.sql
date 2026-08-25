-- =============================================================================
-- File:        supabase/migrations/20260812100000_wall_interactions.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Phase 8C — likes, comments, and sharing a post onward.
--
--              THE SHARE RULE IS THE HARD PART, and it runs the opposite way to
--              every other read rule in this schema. An ordinary wall post is
--              visible to anyone who may see the profile it sits on. A SHARED
--              post is visible only to someone who is a connection of BOTH the
--              sharer and the original author.
--
--              That is stricter, deliberately, and it is the only honest way to
--              share someone else's words: resharing must not become a way to
--              widen the audience for something a person wrote to a smaller one.
--              A post written for Maya's connections stays inside Maya's
--              connections, whoever passes it on.
--
--              THE CONSEQUENCE IS REAL AND WORTH KNOWING: most people will not
--              see most shares. Someone who shares a post from a classmate their
--              own friends have never met has shared it with nobody. That is the
--              rule working, not failing, and the UI says so rather than
--              rendering a mysteriously empty feed.
--
--              WHY A SHARE CANNOT BE SHARED. Chains would make the rule
--              unenforceable — by the third hop "both owners" no longer names
--              the person who actually wrote the words. A share always points at
--              an original.
-- Version:     0.21.0
--
-- Modifications:
--     0.21.0 - 2026-08-12 - Initial schema (Phase 8C)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sharing
-- -----------------------------------------------------------------------------

alter table wall_posts
  add column original_post_id uuid references wall_posts (id) on delete cascade;

comment on column wall_posts.original_post_id is
  'The post this one passes on. Null for an original. Cascades: if the words are deleted, every share of them goes too — a share is a pointer, not a copy.';

-- A share may carry no words of its own, which an original may not.
alter table wall_posts alter column body drop not null;

alter table wall_posts drop constraint wall_posts_body_check;

alter table wall_posts
  add constraint wall_posts_says_something check (
    (body is not null and char_length(btrim(body)) between 1 and 1000)
    or (original_post_id is not null and body is null)
  );

create index wall_posts_original_idx
  on wall_posts (original_post_id)
  where original_post_id is not null;

-- The owner of a post, for the policy below.
--
-- A TINY FUNCTION FOR A REAL REASON: the share rule needs the ORIGINAL post's
-- owner while deciding whether to show a row of the same table. Written as a
-- subquery inside the policy it would re-enter wall_posts' own RLS and recurse;
-- definer rights end that.
create or replace function public.app_wall_post_owner(target_post_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.profile_owner_id from public.wall_posts p where p.id = target_post_id;
$$;

revoke execute on function public.app_wall_post_owner(uuid) from public;
grant execute on function public.app_wall_post_owner(uuid) to authenticated;

-- A share points at an original, and never at another share.
create or replace function public.check_wall_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_original_is_share boolean;
begin
  if new.original_post_id is null then
    return new;
  end if;

  if new.original_post_id = new.id then
    raise exception 'A post cannot share itself.' using errcode = '23514';
  end if;

  select p.original_post_id is not null
  into v_original_is_share
  from public.wall_posts p
  where p.id = new.original_post_id;

  if v_original_is_share then
    raise exception 'Share the original post rather than a share of it.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger wall_posts_check_share
  before insert or update on public.wall_posts
  for each row execute function public.check_wall_share();

-- ---- The read rule, restated for shares -------------------------------------

drop policy "a wall is as visible as the profile it is on" on public.wall_posts;

create policy "a wall is as visible as the profile it is on"
  on public.wall_posts for select to authenticated
  using (
    -- Your own wall, always.
    profile_owner_id = auth.uid()
    -- An original: as visible as the profile it sits on.
    or (
      original_post_id is null
      and public.app_can_see_profile(profile_owner_id)
    )
    -- A share: BOTH ENDS. Connected to whoever passed it on, and connected to
    -- whoever wrote it. Passing a post along must not widen its audience.
    or (
      original_post_id is not null
      and public.app_is_connection(auth.uid(), profile_owner_id)
      and public.app_is_connection(
        auth.uid(),
        public.app_wall_post_owner(original_post_id)
      )
    )
  );

-- Sharing is posting, so the insert policy already covers who may do it: your
-- own wall, or a connection's. Nothing further is needed here — and note what
-- that means, deliberately: you may share onto a connection's wall, and the
-- people who then see it are the ones connected to both of you.

-- -----------------------------------------------------------------------------
-- Can the caller see this post at all?
-- -----------------------------------------------------------------------------

-- One place that answers it, for the two tables that hang off a post.
--
-- Definer, so likes and comments cannot be used to probe for posts their owner
-- may not read: without it, a policy could leak the existence of a share by
-- letting someone insert a like against it.
create or replace function public.app_can_see_wall_post(target_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.wall_posts p
    where p.id = target_post_id
      and (
        p.profile_owner_id = auth.uid()
        or (
          p.original_post_id is null
          and public.app_can_see_profile(p.profile_owner_id)
        )
        or (
          p.original_post_id is not null
          and public.app_is_connection(auth.uid(), p.profile_owner_id)
          and public.app_is_connection(
            auth.uid(),
            public.app_wall_post_owner(p.original_post_id)
          )
        )
      )
  );
$$;

comment on function public.app_can_see_wall_post is
  'The wall_posts SELECT rule, in one callable place, so likes and comments cannot become a side channel for posts the caller may not read.';

revoke execute on function public.app_can_see_wall_post(uuid) from public;
grant execute on function public.app_can_see_wall_post(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Likes
-- -----------------------------------------------------------------------------

create table post_likes (
  post_id    uuid not null references wall_posts (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One like per person per post, enforced by the key rather than by the button
  -- being disabled. Toggling is a delete and an insert, not a counter.
  primary key (post_id, profile_id)
);

comment on table post_likes is
  'One row per person per post. There is no count column: a like is a row, and a stored total is a second copy of something these rows already say.';

create index post_likes_post_idx on post_likes (post_id);

grant all privileges on public.post_likes to service_role;
grant select, insert, delete on public.post_likes to authenticated;

alter table post_likes enable row level security;

-- Likes are as visible as the post. No UPDATE grant: a like is on or off.
create policy "likes are as visible as the post"
  on public.post_likes for select to authenticated
  using (public.app_can_see_wall_post(post_id));

create policy "you can like a post you can see"
  on public.post_likes for insert to authenticated
  with check (profile_id = auth.uid() and public.app_can_see_wall_post(post_id));

create policy "you can take back your own like"
  on public.post_likes for delete to authenticated
  using (profile_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Comments
-- -----------------------------------------------------------------------------

create table post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references wall_posts (id) on delete cascade,
  -- `set null`, as everywhere else authorship is recorded: a thread is a shared
  -- record, and deleting an account should not edit other people's reading of it.
  author_id  uuid references profiles (id) on delete set null,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table post_comments is
  'Comments under a wall post. Visible to whoever may see the post, which for a shared post means connected to both ends.';

create index post_comments_post_created_idx on post_comments (post_id, created_at);

create or replace function public.touch_post_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.post_id is distinct from old.post_id
     or new.author_id is distinct from old.author_id then
    raise exception 'A comment cannot be moved or reattributed.' using errcode = '42501';
  end if;

  new.updated_at := now();
  new.created_at := old.created_at;

  return new;
end;
$$;

create trigger post_comments_touch
  before update on public.post_comments
  for each row execute function public.touch_post_comment();

grant all privileges on public.post_comments to service_role;
grant select, insert, update, delete on public.post_comments to authenticated;

alter table post_comments enable row level security;

create policy "comments are as visible as the post"
  on public.post_comments for select to authenticated
  using (public.app_can_see_wall_post(post_id));

create policy "you can comment on a post you can see"
  on public.post_comments for insert to authenticated
  with check (author_id = auth.uid() and public.app_can_see_wall_post(post_id));

create policy "you can edit your own comment"
  on public.post_comments for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- The author, or whoever owns the wall the post is on — the same rule the posts
-- themselves follow, and for the same reason: it is their profile.
create policy "the author or the wall's owner can remove a comment"
  on public.post_comments for delete to authenticated
  using (
    author_id = auth.uid()
    or exists (
      select 1
      from public.wall_posts p
      where p.id = post_comments.post_id
        and p.profile_owner_id = auth.uid()
    )
  );

-- Both update live, like the wall itself.
alter publication supabase_realtime add table public.post_likes;
alter publication supabase_realtime add table public.post_comments;

-- -----------------------------------------------------------------------------
-- Editing a post
-- -----------------------------------------------------------------------------

-- wall_posts already carries updated_at, maintained by touch_wall_post. What it
-- did not have was a way to tell an edited post from an untouched one: the
-- trigger sets updated_at on every write, so equality with created_at is the
-- honest test and needs no extra column.
--
-- Exposed as a generated column so the application does not have to remember the
-- rule, and cannot drift from it.
alter table wall_posts
  add column is_edited boolean generated always as (updated_at > created_at) stored;

comment on column wall_posts.is_edited is
  'Derived, never written. An edited post says so; the alternative was an application-set flag that could disagree with the timestamps beside it.';
