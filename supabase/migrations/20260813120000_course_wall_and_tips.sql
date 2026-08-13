-- =============================================================================
-- File:        supabase/migrations/20260813120000_course_wall_and_tips.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Phase 9C — a course becomes a place, not a list.
--
--              TWO SOCIAL SURFACES, DELIBERATELY SEPARATE. The wall is the
--              conversation happening in the course now; tips are the advice
--              that outlives the semester. They look alike and behave
--              differently: a wall post is ordered by when it was written and a
--              tip by how useful the class found it, which is why a tip is
--              rated and a post is liked. Folding them into one table with a
--              `kind` column would mean every query carrying a filter it must
--              never forget.
--
--              ENROLMENT IS THE WHOLE VISIBILITY RULE, and it is one predicate:
--              app_is_enrolled. A student in the course sees everything in it
--              and may write; everyone else sees nothing. That is simpler than
--              the profile wall's rule — which has to reason about connections
--              and shares — because a course has a membership list and a person
--              does not.
--
--              WHY NOT REUSE wall_posts. It was tempting: identical shape, and
--              every component and query would have worked unchanged. It would
--              have meant making profile_owner_id nullable, and that column is
--              load-bearing for three notification triggers, the freeze trigger
--              that protects authorship, and app_can_see_wall_post. Widening a
--              working table to carry a second meaning is how the wall's
--              visibility rule would eventually get one branch too few.
-- Version:     0.25.0
--
-- Modifications:
--     0.25.0 - 2026-08-13 - Initial implementation (Phase 9C)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The rule everything below rests on
-- -----------------------------------------------------------------------------

-- Whether the caller is taking a course.
--
-- SECURITY DEFINER because it reads `enrollments`, whose own RLS narrows the
-- caller to rows they may see — asking it "is anyone enrolled here?" from inside
-- a policy would otherwise answer only about themselves in some contexts and
-- recurse in others.
create or replace function public.app_is_enrolled(target_offering_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.course_offering_id = target_offering_id
      and e.profile_id = auth.uid()
  );
$$;

revoke execute on function public.app_is_enrolled(uuid) from public;
grant execute on function public.app_is_enrolled(uuid) to authenticated;

comment on function public.app_is_enrolled is
  'Whether the caller is enrolled in a course offering. The single visibility rule for everything on a course page.';

-- -----------------------------------------------------------------------------
-- Part 1: the course wall
-- -----------------------------------------------------------------------------

create table course_posts (
  id                 uuid primary key default gen_random_uuid(),
  course_offering_id uuid not null references course_offerings (id) on delete cascade,
  -- `set null`, matching wall_posts: deleting an account must not rewrite what
  -- other people are reading. The post stays, attributed to nobody.
  author_id          uuid references profiles (id) on delete set null,
  body               text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table course_posts is
  'The wall of a course offering. Visible to, and writable by, the students enrolled in it.';

create index course_posts_offering_recent_idx
  on course_posts (course_offering_id, created_at desc);

create table course_post_likes (
  post_id    uuid not null references course_posts (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- One like per person per post, by the key rather than by the button.
  primary key (post_id, profile_id)
);

create index course_post_likes_post_idx on course_post_likes (post_id);

create table course_post_comments (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references course_posts (id) on delete cascade,
  author_id         uuid references profiles (id) on delete set null,
  -- One level of replies, same as the profile wall: by the third level nobody
  -- can tell who is answering whom.
  parent_comment_id uuid references course_post_comments (id) on delete cascade,
  body              text not null check (char_length(btrim(body)) between 1 and 500),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index course_post_comments_post_created_idx
  on course_post_comments (post_id, created_at);

create index course_post_comments_parent_idx
  on course_post_comments (parent_comment_id)
  where parent_comment_id is not null;

create table course_comment_likes (
  comment_id uuid not null references course_post_comments (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, profile_id)
);

create index course_comment_likes_comment_idx on course_comment_likes (comment_id);

-- -----------------------------------------------------------------------------
-- Part 2: tips
-- -----------------------------------------------------------------------------

create table course_tips (
  id                 uuid primary key default gen_random_uuid(),
  course_offering_id uuid not null references course_offerings (id) on delete cascade,
  author_id          uuid references profiles (id) on delete set null,
  body               text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table course_tips is
  'Advice about a course, written by students taking or who have taken it. Ordered by how the class rated it rather than by when it was written — see rpc_course_tips.';

create index course_tips_offering_idx on course_tips (course_offering_id);

create table course_tip_ratings (
  tip_id     uuid not null references course_tips (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  stars      smallint not null check (stars between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One rating per person per tip. Changing your mind is an UPDATE of your own
  -- row, not a second vote — which is the whole reason the average can be
  -- trusted.
  primary key (tip_id, profile_id)
);

create index course_tip_ratings_tip_idx on course_tip_ratings (tip_id);

-- -----------------------------------------------------------------------------
-- Part 3: keeping the timestamps honest
-- -----------------------------------------------------------------------------

create trigger course_posts_touch
  before update on public.course_posts
  for each row execute function public.set_updated_at();

create trigger course_post_comments_touch
  before update on public.course_post_comments
  for each row execute function public.set_updated_at();

create trigger course_tips_touch
  before update on public.course_tips
  for each row execute function public.set_updated_at();

create trigger course_tip_ratings_touch
  before update on public.course_tip_ratings
  for each row execute function public.set_updated_at();

-- A reply belongs to the same post as its parent, and its parent is top level.
--
-- Neither can be a CHECK: both read another row. Lifted from
-- check_comment_reply on the profile wall, for the same two reasons — a reply
-- attached to a comment on another post would be visible to the wrong audience,
-- and a reply to a reply stops naming the right person.
create or replace function public.check_course_comment_reply()
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
  from public.course_post_comments c
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

create trigger course_post_comments_check_reply
  before insert or update on public.course_post_comments
  for each row execute function public.check_course_comment_reply();

-- Authorship may be LOST, never MOVED — the rule Phase 8D wrote down after the
-- fourth time this shape appeared. X to NULL is the cascade from a deleted
-- account and is allowed; X to Y is a reattribution and stays refused.
create or replace function public.freeze_course_authorship()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.author_id is distinct from old.author_id and new.author_id is not null then
    raise exception 'This cannot be reattributed to another author.'
      using errcode = '42501';
  end if;

  if new.course_offering_id is distinct from old.course_offering_id then
    raise exception 'This cannot be moved to another course.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger course_posts_freeze_authorship
  before update on public.course_posts
  for each row execute function public.freeze_course_authorship();

create trigger course_tips_freeze_authorship
  before update on public.course_tips
  for each row execute function public.freeze_course_authorship();

-- -----------------------------------------------------------------------------
-- Part 4: who may see and do what
-- -----------------------------------------------------------------------------

-- Wraps the enrolment rule so a like or a comment cannot become a side channel
-- confirming a post the caller may not read.
create or replace function public.app_can_see_course_post(target_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.course_posts p
    where p.id = target_post_id
      and public.app_is_enrolled(p.course_offering_id)
  );
$$;

create or replace function public.app_can_see_course_comment(target_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.course_post_comments c
    where c.id = target_comment_id
      and public.app_can_see_course_post(c.post_id)
  );
$$;

create or replace function public.app_can_see_course_tip(target_tip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.course_tips t
    where t.id = target_tip_id
      and public.app_is_enrolled(t.course_offering_id)
  );
$$;

revoke execute on function public.app_can_see_course_post(uuid) from public;
revoke execute on function public.app_can_see_course_comment(uuid) from public;
revoke execute on function public.app_can_see_course_tip(uuid) from public;
grant execute on function public.app_can_see_course_post(uuid) to authenticated;
grant execute on function public.app_can_see_course_comment(uuid) to authenticated;
grant execute on function public.app_can_see_course_tip(uuid) to authenticated;

grant all privileges on public.course_posts          to service_role;
grant all privileges on public.course_post_likes     to service_role;
grant all privileges on public.course_post_comments  to service_role;
grant all privileges on public.course_comment_likes  to service_role;
grant all privileges on public.course_tips           to service_role;
grant all privileges on public.course_tip_ratings    to service_role;

grant select, insert, update, delete on public.course_posts         to authenticated;
grant select, insert, update, delete on public.course_post_comments to authenticated;
grant select, insert, update, delete on public.course_tips          to authenticated;
-- A like is on or off, so there is nothing to UPDATE.
grant select, insert, delete         on public.course_post_likes    to authenticated;
grant select, insert, delete         on public.course_comment_likes to authenticated;
-- A rating IS updated: changing your mind must not be a second vote.
grant select, insert, update, delete on public.course_tip_ratings   to authenticated;

alter table course_posts         enable row level security;
alter table course_post_likes    enable row level security;
alter table course_post_comments enable row level security;
alter table course_comment_likes enable row level security;
alter table course_tips          enable row level security;
alter table course_tip_ratings   enable row level security;

-- ---- Posts ------------------------------------------------------------------

create policy "a course wall is visible to the class"
  on public.course_posts for select to authenticated
  using (public.app_is_enrolled(course_offering_id));

create policy "you can post on a course you are taking"
  on public.course_posts for insert to authenticated
  with check (author_id = auth.uid() and public.app_is_enrolled(course_offering_id));

create policy "you can edit a post you wrote"
  on public.course_posts for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- No wall owner to appeal to on a course, so the author is the only person who
-- may remove a post. Moderation, if it ever arrives, is a separate role.
create policy "you can remove a post you wrote"
  on public.course_posts for delete to authenticated
  using (author_id = auth.uid());

-- ---- Post likes -------------------------------------------------------------

create policy "course post likes are as visible as the post"
  on public.course_post_likes for select to authenticated
  using (public.app_can_see_course_post(post_id));

create policy "you can like a course post you can see"
  on public.course_post_likes for insert to authenticated
  with check (profile_id = auth.uid() and public.app_can_see_course_post(post_id));

create policy "you can take back your own course post like"
  on public.course_post_likes for delete to authenticated
  using (profile_id = auth.uid());

-- ---- Comments ---------------------------------------------------------------

create policy "course comments are as visible as the post"
  on public.course_post_comments for select to authenticated
  using (public.app_can_see_course_post(post_id));

create policy "you can comment on a course post you can see"
  on public.course_post_comments for insert to authenticated
  with check (author_id = auth.uid() and public.app_can_see_course_post(post_id));

create policy "you can edit a comment you wrote"
  on public.course_post_comments for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "you can remove a comment you wrote"
  on public.course_post_comments for delete to authenticated
  using (author_id = auth.uid());

-- ---- Comment likes ----------------------------------------------------------

create policy "course comment likes are as visible as the comment"
  on public.course_comment_likes for select to authenticated
  using (public.app_can_see_course_comment(comment_id));

create policy "you can like a course comment you can see"
  on public.course_comment_likes for insert to authenticated
  with check (profile_id = auth.uid() and public.app_can_see_course_comment(comment_id));

create policy "you can take back your own course comment like"
  on public.course_comment_likes for delete to authenticated
  using (profile_id = auth.uid());

-- ---- Tips -------------------------------------------------------------------

create policy "tips are visible to the class"
  on public.course_tips for select to authenticated
  using (public.app_is_enrolled(course_offering_id));

create policy "you can write a tip for a course you are taking"
  on public.course_tips for insert to authenticated
  with check (author_id = auth.uid() and public.app_is_enrolled(course_offering_id));

create policy "you can edit a tip you wrote"
  on public.course_tips for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "you can remove a tip you wrote"
  on public.course_tips for delete to authenticated
  using (author_id = auth.uid());

-- ---- Tip ratings ------------------------------------------------------------

-- Every rating is readable by the class, not just your own: the average is the
-- point of the feature, and a private rating could not produce one honestly.
create policy "tip ratings are as visible as the tip"
  on public.course_tip_ratings for select to authenticated
  using (public.app_can_see_course_tip(tip_id));

create policy "you can rate a tip you can see"
  on public.course_tip_ratings for insert to authenticated
  with check (profile_id = auth.uid() and public.app_can_see_course_tip(tip_id));

create policy "you can change your own rating"
  on public.course_tip_ratings for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "you can withdraw your own rating"
  on public.course_tip_ratings for delete to authenticated
  using (profile_id = auth.uid());

alter publication supabase_realtime add table public.course_posts;
alter publication supabase_realtime add table public.course_post_likes;
alter publication supabase_realtime add table public.course_post_comments;
alter publication supabase_realtime add table public.course_comment_likes;

-- -----------------------------------------------------------------------------
-- Part 5: tips, in the order the class put them
-- -----------------------------------------------------------------------------

-- WHY AN RPC AND NOT AN EMBEDDED SELECT. "Sorted by average rating" is an
-- ordering on an aggregate of a joined table, and PostgREST can embed the
-- ratings but cannot order the parent by a function of them — the sort would
-- have to happen in JavaScript, after a LIMIT had already thrown away the rows
-- that should have been at the top.
--
-- UNRATED TIPS SORT AS 0 AND SIT AT THE BOTTOM, rather than being hidden or
-- floated to the top. A tip nobody has rated is not a bad tip, but it has not
-- earned a place above one the class has endorsed; putting it last is what makes
-- the first screen worth reading. `rating_count` is returned so the interface can
-- say "not rated yet" instead of showing it as a zero-star tip.
create or replace function public.rpc_course_tips(p_offering_id uuid)
returns table (
  id            uuid,
  body          text,
  created_at    timestamptz,
  author_id     uuid,
  author_name   text,
  author_avatar text,
  average_stars numeric,
  rating_count  bigint,
  my_stars      smallint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id,
    t.body,
    t.created_at,
    t.author_id,
    p.full_name,
    p.avatar_url,
    coalesce(avg(r.stars), 0)::numeric(3, 2),
    count(r.stars),
    max(r.stars) filter (where r.profile_id = auth.uid())
  from public.course_tips t
  left join public.profiles p on p.id = t.author_id
  left join public.course_tip_ratings r on r.tip_id = t.id
  where t.course_offering_id = p_offering_id
  group by t.id, t.body, t.created_at, t.author_id, p.full_name, p.avatar_url
  order by coalesce(avg(r.stars), 0) desc, count(r.stars) desc, t.created_at desc;
$$;

comment on function public.rpc_course_tips is
  'Tips for a course offering, highest average rating first, then most-rated, then newest. SECURITY INVOKER so the RLS on course_tips and course_tip_ratings is what decides whether the caller sees anything at all.';

revoke execute on function public.rpc_course_tips(uuid) from public;
grant execute on function public.rpc_course_tips(uuid) to authenticated;
