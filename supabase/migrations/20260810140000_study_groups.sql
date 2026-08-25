-- =============================================================================
-- File:        supabase/migrations/20260810140000_study_groups.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Phase 5 — study groups, join requests, and a group chat.
--
--              This closes design conflict C4, which has been open since Phase
--              1.5: the source design showed study groups and the schema had
--              nowhere to put them.
--
--              FOUR TABLES, and the split matters:
--                study_groups         the group itself, owned by one admin
--                study_group_members  who is in it
--                group_requests       who has asked to be
--                study_group_messages the group's chat
--
--              WHY MEMBERSHIP IS ITS OWN TABLE rather than an array on
--              study_groups: a member list is a set of foreign keys with a join
--              date, and an array of uuids cannot be constrained, cannot cascade
--              when a student is deleted, and cannot be joined against without
--              unnesting it on every read.
--
--              WHY THE GROUP CHAT IS NOT `conversations`. That table is strictly
--              one-to-one — two NOT NULL participants, a no-self CHECK, and a
--              unique index on the unordered pair — and Phase 3's policies lean on
--              exactly that shape. Widening it to hold N participants would mean
--              rewriting the tightest RLS in the project to serve a second use
--              case. A separate table costs some duplication and keeps private
--              one-to-one messages exactly as private as they were.
--
--              WHAT 'status' MEANS. It is 'open' or 'closed', set by the admin.
--              "Full" is NOT a status: it is a count against max_participants, and
--              storing it would be a second copy of a number the members table
--              already knows — free to drift the moment someone leaves.
-- Version:     0.15.0
--
-- Modifications:
--     0.15.0 - 2026-08-10 - Initial schema (Phase 5)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

create type study_group_status as enum (
  'open',    -- accepting requests
  'closed'   -- the admin has stopped accepting them
);

comment on type study_group_status is
  'Set by the admin. "Full" is deliberately absent — that is a member count against max_participants, not a stored state.';

create type group_request_status as enum ('pending', 'approved', 'rejected');

-- -----------------------------------------------------------------------------
-- Study groups
-- -----------------------------------------------------------------------------

create table study_groups (
  id                 uuid primary key default gen_random_uuid(),
  -- A group belongs to ONE course. That is the whole premise of the product: a
  -- study group for Computational Models, not a general club.
  course_offering_id uuid not null references course_offerings (id) on delete cascade,
  -- Denormalised, as on enrollments and conversations: the tenancy check runs on
  -- every row read and must not need a join.
  university_id      uuid not null references universities (id) on delete cascade,
  admin_id           uuid not null references profiles (id) on delete cascade,
  name               text not null check (char_length(btrim(name)) between 3 and 80),
  description        text check (char_length(description) <= 400),
  -- Two is the smallest thing that is a group. The upper bound is a guard against
  -- a typo, not a product opinion.
  max_participants   smallint not null check (max_participants between 2 and 20),
  status             study_group_status not null default 'open',
  created_at         timestamptz not null default now()
);

comment on table study_groups is
  'A study group for one course offering, administered by the student who created it. Resolves design conflict C4.';

create index study_groups_offering_status_idx
  on study_groups (course_offering_id, status);

create index study_groups_admin_idx on study_groups (admin_id);

-- -----------------------------------------------------------------------------
-- Membership
-- -----------------------------------------------------------------------------

create table study_group_members (
  group_id   uuid not null references study_groups (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (group_id, profile_id)
);

comment on table study_group_members is
  'Who is in a group. The admin is inserted here by trigger when the group is created, so "members" always includes them and no query has to special-case the owner.';

-- The reverse lookup — "which groups am I in" — needs its own index.
create index study_group_members_profile_idx on study_group_members (profile_id);

-- -----------------------------------------------------------------------------
-- Join requests
-- -----------------------------------------------------------------------------

create table group_requests (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references study_groups (id) on delete cascade,
  requester_id uuid not null references profiles (id) on delete cascade,
  status       group_request_status not null default 'pending',
  -- The rejection text actually sent, kept for provenance: the student received
  -- it as a message, and the group's history should say what was said.
  decision_note text check (char_length(decision_note) <= 500),
  decided_at   timestamptz,
  decided_by   uuid references profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table group_requests is
  'Join requests. Rows are never deleted — a rejected request is the record that stops a pair silently cycling, the same reasoning as connection_requests.';

-- One LIVE request per student per group. Rejected rows are excluded, so someone
-- can ask again later; pending and approved are not, so nobody can queue two.
create unique index group_requests_one_live_per_student_idx
  on group_requests (group_id, requester_id)
  where status in ('pending', 'approved');

-- The admin's notification count reads "pending requests for my groups".
create index group_requests_group_status_idx on group_requests (group_id, status);

create index group_requests_requester_idx on group_requests (requester_id, status);

-- -----------------------------------------------------------------------------
-- Group chat
-- -----------------------------------------------------------------------------

create table study_group_messages (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references study_groups (id) on delete cascade,
  -- NULL for a system message. A "Welcome X to the group!" line is written by the
  -- application, not by a person, and attributing it to the admin would put words
  -- in their mouth.
  sender_id  uuid references profiles (id) on delete set null,
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  is_system  boolean not null default false,
  created_at timestamptz not null default now(),
  -- The two must agree: a system message has no sender, a human one does.
  constraint study_group_messages_system_has_no_sender
    check ((is_system and sender_id is null) or (not is_system and sender_id is not null))
);

comment on table study_group_messages is
  'The group''s chat. System messages have sender_id NULL and is_system true, so the UI can render them as events rather than as something a person said.';

create index study_group_messages_group_created_idx
  on study_group_messages (group_id, created_at);

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Whether the caller is in the given group.
--
-- SECURITY DEFINER, unlike app_is_conversation_participant. This one is called
-- FROM the study_group_members policy, so reading that table under RLS would
-- re-enter the policy and recurse — the same reason app_current_university_id is
-- definer. It answers exactly the question the policy asks and discloses nothing
-- else.
create or replace function public.app_is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.study_group_members m
    where m.group_id = target_group_id
      and m.profile_id = auth.uid()
  );
$$;

comment on function public.app_is_group_member is
  'True when the caller is a member. SECURITY DEFINER to avoid recursing into the members policy that calls it.';

revoke execute on function public.app_is_group_member(uuid) from public;
grant execute on function public.app_is_group_member(uuid) to authenticated;

-- Whether the caller administers the group.
create or replace function public.app_is_group_admin(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.study_groups g
    where g.id = target_group_id
      and g.admin_id = auth.uid()
  );
$$;

comment on function public.app_is_group_admin is
  'True when the caller created the group. Definer so it can be used from policies on other tables without depending on the study_groups policy.';

revoke execute on function public.app_is_group_admin(uuid) from public;
grant execute on function public.app_is_group_admin(uuid) to authenticated;

-- Whether the caller takes the course a group belongs to.
--
-- This is the DISCOVERY rule: you can see the groups in your own courses, which
-- is how "Display open study groups in the Course View" works at all. Definer so
-- it does not depend on the enrollments policy, and it only ever answers about
-- the caller's own enrolments.
create or replace function public.app_can_see_group(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.study_groups g
    join public.enrollments e
      on e.course_offering_id = g.course_offering_id
     and e.profile_id = auth.uid()
    where g.id = target_group_id
  );
$$;

comment on function public.app_can_see_group is
  'True when the caller is enrolled in the group''s course. The discovery rule: groups are visible to the class, contents only to members.';

revoke execute on function public.app_can_see_group(uuid) from public;
grant execute on function public.app_can_see_group(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

-- The creator is a member from the moment the group exists.
--
-- SECURITY DEFINER because the members INSERT policy only lets an admin add an
-- APPROVED requester, and at this instant there is no request to approve. Doing it
-- here rather than in the application means a group can never exist with an admin
-- who is not in it — a state every member-count and every chat policy would then
-- have to tolerate.
create or replace function public.add_group_admin_as_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.study_group_members (group_id, profile_id)
  values (new.id, new.admin_id)
  on conflict do nothing;

  return new;
end;
$$;

create trigger study_groups_add_admin
  after insert on public.study_groups
  for each row execute function public.add_group_admin_as_member();

-- A group must not straddle two institutions, and its admin must take the course.
--
-- The insert policy checks both from the caller's side; this checks the row's own
-- claims, so a hand-built insert cannot name a course from elsewhere. Definer
-- because it reads another student's enrolments in the general case.
create or replace function public.check_study_group_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  offering_university uuid;
begin
  select c.university_id
  into offering_university
  from public.course_offerings o
  join public.courses c on c.id = o.course_id
  where o.id = new.course_offering_id;

  if offering_university is null or offering_university <> new.university_id then
    raise exception 'A study group must belong to a course at its own university.'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.enrollments e
    where e.profile_id = new.admin_id
      and e.course_offering_id = new.course_offering_id
  ) then
    raise exception 'The group admin must be enrolled in the course.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger study_groups_consistency
  before insert or update on public.study_groups
  for each row execute function public.check_study_group_consistency();

-- A request cannot be re-decided, and its content cannot be rewritten.
--
-- The gap RLS cannot cover: the admin legitimately UPDATEs a request to decide it,
-- so only a trigger can stop that same permission being used to flip a decision
-- back and forth or to edit who asked.
create or replace function public.freeze_group_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('role', true) is distinct from 'service_role' then
    if old.status <> 'pending' then
      raise exception 'This request has already been decided.'
        using errcode = '42501';
    end if;

    if new.group_id is distinct from old.group_id
       or new.requester_id is distinct from old.requester_id
       or new.created_at is distinct from old.created_at then
      raise exception 'A request cannot be reassigned.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger group_requests_freeze
  before update on public.group_requests
  for each row execute function public.freeze_group_request();

-- Capacity is enforced where it cannot be raced.
--
-- Checking "is there room?" in the application and then inserting is two
-- statements: two admins approving at once both see room and both insert. This
-- runs inside the insert's own transaction, so the second one fails.
create or replace function public.check_group_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  capacity integer;
  occupied integer;
begin
  select g.max_participants into capacity
  from public.study_groups g
  where g.id = new.group_id;

  select count(*) into occupied
  from public.study_group_members m
  where m.group_id = new.group_id;

  if occupied >= capacity then
    raise exception 'This group is already full.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger study_group_members_capacity
  before insert on public.study_group_members
  for each row execute function public.check_group_capacity();

-- -----------------------------------------------------------------------------
-- Grants (layer 1)
-- -----------------------------------------------------------------------------

grant all privileges on public.study_groups         to service_role;
grant all privileges on public.study_group_members  to service_role;
grant all privileges on public.group_requests        to service_role;
grant all privileges on public.study_group_messages  to service_role;

-- No DELETE on group_requests: a decided request is the record. No UPDATE on
-- messages, for the same reason as one-to-one messages.
grant select, insert, update         on public.study_groups        to authenticated;
grant select, insert, delete         on public.study_group_members to authenticated;
grant select, insert, update         on public.group_requests      to authenticated;
grant select, insert                 on public.study_group_messages to authenticated;

-- -----------------------------------------------------------------------------
-- RLS (layer 2)
-- -----------------------------------------------------------------------------

alter table study_groups        enable row level security;
alter table study_group_members enable row level security;
alter table group_requests      enable row level security;
alter table study_group_messages enable row level security;

-- ---- study_groups -----------------------------------------------------------

-- Discovery: the class can see the groups. This is the point of the feature — a
-- group nobody can find has nobody to join it.
--
-- Written against the ROW'S OWN COLUMNS rather than by calling
-- app_can_see_group(id), and that is not a style choice. That helper re-reads
-- `study_groups` to find the row it is being asked about, and it is STABLE — so
-- during an `insert ... returning` it evaluates against the snapshot from before
-- the insert, cannot find the new row, and the statement fails with a policy
-- violation. Any client doing insert().select() on this table would hit it.
--
-- The helper is still the right tool for the other three tables, where the group
-- id is a foreign key to a row that already exists.
create policy "groups are visible to the course"
  on public.study_groups for select to authenticated
  using (
    admin_id = auth.uid()
    or exists (
      select 1
      from public.enrollments e
      where e.profile_id = auth.uid()
        and e.course_offering_id = study_groups.course_offering_id
    )
  );

-- You may only create a group you administer, in a course you take, at your own
-- university. The trigger above independently verifies the row's own claims.
create policy "you can create a group you administer"
  on public.study_groups for insert to authenticated
  with check (
    admin_id = auth.uid()
    and university_id = public.app_current_university_id()
    and exists (
      select 1
      from public.enrollments e
      where e.profile_id = auth.uid()
        and e.course_offering_id = study_groups.course_offering_id
    )
  );

-- Only the admin edits the group, and only its own row.
create policy "the admin can update their group"
  on public.study_groups for update to authenticated
  using (admin_id = auth.uid())
  with check (admin_id = auth.uid());

-- ---- study_group_members ----------------------------------------------------

-- Visible to the whole class, because the group card shows "3 of 5 spaces taken".
-- Who is in a study group for a course you are also taking is not a secret; what
-- they say to each other is, and that is the messages policy below.
create policy "membership is visible to the course"
  on public.study_group_members for select to authenticated
  using (public.app_can_see_group(group_id));

-- Only the admin adds people, and only ones who ASKED and were approved. Without
-- the request check an admin could add any classmate to a group without consent.
create policy "the admin can add an approved requester"
  on public.study_group_members for insert to authenticated
  with check (
    public.app_is_group_admin(group_id)
    and exists (
      select 1
      from public.group_requests r
      where r.group_id = study_group_members.group_id
        and r.requester_id = study_group_members.profile_id
        and r.status = 'approved'
    )
  );

-- You can leave; the admin can remove someone. The admin cannot leave their own
-- group — that would orphan it, and handing the group over is a feature nobody
-- asked for yet.
create policy "you can leave, or be removed by the admin"
  on public.study_group_members for delete to authenticated
  using (
    (profile_id = auth.uid() and not public.app_is_group_admin(group_id))
    or (public.app_is_group_admin(group_id) and profile_id <> auth.uid())
  );

-- ---- group_requests ---------------------------------------------------------

-- The two people it concerns: the student who asked, and the admin who decides.
create policy "you can read requests you sent or receive"
  on public.group_requests for select to authenticated
  using (requester_id = auth.uid() or public.app_is_group_admin(group_id));

-- Only as yourself, only as pending, only to an OPEN group in a course you take,
-- and not if you are already in it.
create policy "you can ask to join a group you can see"
  on public.group_requests for insert to authenticated
  with check (
    requester_id = auth.uid()
    and status = 'pending'
    and public.app_can_see_group(group_id)
    and not public.app_is_group_member(group_id)
    and exists (
      select 1
      from public.study_groups g
      where g.id = group_requests.group_id
        and g.status = 'open'
    )
  );

-- Only the admin decides, and only into a decided state. The freeze trigger stops
-- this being used to re-decide later.
create policy "the admin can decide a request"
  on public.group_requests for update to authenticated
  using (public.app_is_group_admin(group_id))
  with check (public.app_is_group_admin(group_id) and status in ('approved', 'rejected'));

-- ---- study_group_messages ---------------------------------------------------

-- Members only. This is the line between "the class can see the group exists" and
-- "the group's conversation is theirs".
create policy "members can read the group chat"
  on public.study_group_messages for select to authenticated
  using (public.app_is_group_member(group_id));

-- Members write as themselves, and cannot forge a system message: is_system false
-- is required here, so the "Welcome X" line can only come from elevated code.
create policy "members can post as themselves"
  on public.study_group_messages for insert to authenticated
  with check (
    public.app_is_group_member(group_id)
    and sender_id = auth.uid()
    and not is_system
  );

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------

-- The group chat updates live, and the admin's request badge with it. RLS applies
-- to the stream, so a student's socket only carries rows they may already read.
alter publication supabase_realtime add table public.study_group_messages;
alter publication supabase_realtime add table public.group_requests;
alter publication supabase_realtime add table public.study_group_members;

-- -----------------------------------------------------------------------------
-- Approving a request, atomically
-- -----------------------------------------------------------------------------

-- Approve a join request: mark it, add the member, and post the welcome line.
--
-- WHY THIS IS ONE FUNCTION AND NOT THREE STATEMENTS IN THE APPLICATION. The
-- members INSERT policy requires an already-approved request, so the application
-- would have to approve first and insert second. If the insert then failed — and
-- it can, because the capacity trigger rejects a group that filled up in between —
-- the request would be left approved with no membership, and the freeze trigger
-- deliberately forbids re-deciding it. That is an unrecoverable state reachable by
-- two admins clicking at the same time.
--
-- Inside one function it is one transaction: capacity fails, everything rolls
-- back, and the request stays pending for the admin to try again.
--
-- SECURITY DEFINER, so it must restate its own authorisation. It does: the caller
-- has to be the group's admin, and the request has to be pending.
create or replace function public.rpc_approve_group_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id     uuid;
  v_requester_id uuid;
  v_full_name    text;
begin
  select r.group_id, r.requester_id
  into v_group_id, v_requester_id
  from public.group_requests r
  join public.study_groups g on g.id = r.group_id
  where r.id = p_request_id
    and r.status = 'pending'
    -- The authorisation. Without this line any signed-in student could approve
    -- anyone into any group, because definer rights bypass every policy above.
    and g.admin_id = auth.uid();

  if v_group_id is null then
    raise exception 'That request is not yours to decide, or has already been decided.'
      using errcode = '42501';
  end if;

  update public.group_requests
  set status = 'approved',
      decided_at = now(),
      decided_by = auth.uid()
  where id = p_request_id;

  -- The capacity trigger fires here. If the group filled up while the admin was
  -- looking at the request, this raises and the approval above is rolled back.
  insert into public.study_group_members (group_id, profile_id)
  values (v_group_id, v_requester_id);

  select p.full_name into v_full_name
  from public.profiles p
  where p.id = v_requester_id;

  -- The system message. Written here rather than by the application so that a
  -- member never appears in a group with no announcement, and so the wording
  -- cannot differ between callers.
  insert into public.study_group_messages (group_id, sender_id, body, is_system)
  values (
    v_group_id,
    null,
    'Welcome ' || coalesce(nullif(btrim(v_full_name), ''), 'a new member') || ' to the group!',
    true
  );

  return v_group_id;
end;
$$;

comment on function public.rpc_approve_group_request is
  'Approves a join request, adds the member and posts the welcome system message in ONE transaction. Restates its own authorisation because definer rights bypass RLS: caller must be the group admin and the request must be pending.';

revoke execute on function public.rpc_approve_group_request(uuid) from public;
grant execute on function public.rpc_approve_group_request(uuid) to authenticated;
