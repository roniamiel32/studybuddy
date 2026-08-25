-- =============================================================================
-- File:        supabase/migrations/20260811100000_group_admin_roles.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Phase 7A — more than one admin per study group.
--
--              THE MOVE: admin stops being a column on study_groups and becomes
--              a ROLE ON MEMBERSHIP. One column cannot hold two admins, and the
--              alternative — keeping admin_id AND adding a role — would give the
--              same fact two homes, which is the drift this schema rejects for
--              group fullness (a count, not a status) and for reputation (read
--              from the rows, never stored on the profile).
--
--              WHY THE ROLE GOES ON study_group_members RATHER THAN IN A NEW
--              study_group_admins TABLE: app_is_group_admin() keeps its name,
--              signature and meaning, so every policy and both RPCs written in
--              Phase 5 keep working untouched. A separate table would also allow
--              an admin who is not a member — a state every capacity check and
--              chat policy would then have to tolerate.
--
--              WHAT admin_id MEANS NOW. It is the FOUNDER: the student who
--              created the group. It no longer decides who may administer —
--              app_is_group_admin reads the members table — but it is still
--              authorisation, because the founder alone may demote an admin and
--              the founder alone cannot be demoted. Two ranks, deliberately:
--              promotion is safe to share, demotion is not, and a flat model
--              lets an admin promoted an hour ago remove the person who built
--              the group.
--
--              THE ESCALATION THIS CLOSES. Admins can now edit their group, and
--              UPDATE on a table is UPDATE on every column of it. Without
--              freeze_study_group() below, an admin would simply set
--              admin_id = auth.uid() and become the founder — the rank they
--              were specifically not given.
-- Version:     0.19.0
--
-- Modifications:
--     0.19.0 - 2026-08-11 - Initial schema (Phase 7A)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The role
-- -----------------------------------------------------------------------------

create type study_group_role as enum ('member', 'admin');

comment on type study_group_role is
  'A member''s rank within one group. The founder is study_groups.admin_id and is always an admin; admin here is the shared rank they can grant.';

alter table study_group_members
  add column role study_group_role not null default 'member';

comment on column study_group_members.role is
  'admin grants every group right except demoting another admin, which is the founder''s alone.';

-- The founder of every existing group becomes its first admin. Written as a
-- backfill rather than a default because the default is 'member' and must stay
-- that way for everyone who joins later.
update study_group_members m
set role = 'admin'
from study_groups g
where g.id = m.group_id
  and g.admin_id = m.profile_id;

-- Every policy on four tables asks "is the caller an admin of this group?".
-- Partial, because the answer only ever reads admin rows.
create index study_group_members_admins_idx
  on study_group_members (group_id)
  where role = 'admin';

-- -----------------------------------------------------------------------------
-- admin_id becomes the founder
-- -----------------------------------------------------------------------------

-- Nullable and `set null`, replacing `not null` + `on delete cascade`.
--
-- The old shape was correct while a group had exactly one admin: losing that
-- student meant losing the group. With co-admins it is a live bug — a group of
-- six with three admins would be deleted because the founder closed their
-- account. Now the group survives and only the founder rank is lost.
alter table study_groups
  drop constraint study_groups_admin_id_fkey;

alter table study_groups
  alter column admin_id drop not null;

alter table study_groups
  add constraint study_groups_admin_id_fkey
    foreign key (admin_id) references profiles (id) on delete set null;

comment on column study_groups.admin_id is
  'The FOUNDER — who created the group. Not the authorisation source for administering it (that is study_group_members.role), but the founder alone may demote an admin, and alone cannot be demoted. Null once their account is deleted, which permanently retires the rank for that group.';

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Redefined: an admin is a MEMBER whose role says so.
--
-- Same name and signature, so the six policies and two RPCs that call it are
-- unchanged, and a group with one admin behaves exactly as it did in Phase 5.
create or replace function public.app_is_group_admin(target_group_id uuid)
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
      and m.role = 'admin'
  );
$$;

comment on function public.app_is_group_admin is
  'True when the caller administers the group. Reads the role on their membership — since Phase 7A a group can have several admins.';

-- The creator joins as an ADMIN, not merely as a member.
--
-- The backfill above fixes groups that already exist; this fixes every group
-- made from now on. Without it a founder is inserted with the column default —
-- 'member' — and cannot approve a request, edit their own group, or promote
-- anyone, while app_is_group_founder still reports them as its founder.
create or replace function public.add_group_admin_as_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.study_group_members (group_id, profile_id, role)
  values (new.id, new.admin_id, 'admin')
  on conflict do nothing;

  return new;
end;
$$;

-- Whether the caller founded the group. The extra rank: demotion.
create or replace function public.app_is_group_founder(target_group_id uuid)
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
      and g.admin_id is not null
      and g.admin_id = auth.uid()
  );
$$;

comment on function public.app_is_group_founder is
  'True when the caller created the group. Only they may demote an admin, and only they cannot be demoted.';

revoke execute on function public.app_is_group_founder(uuid) from public;
grant execute on function public.app_is_group_founder(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- The founder may be absent
-- -----------------------------------------------------------------------------

-- Rewritten for a nullable admin_id. The enrolment rule still holds whenever
-- there IS a founder; it cannot hold when their account is gone, and refusing
-- every later edit to the group would be a worse answer than dropping the check.
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

  if new.admin_id is not null and not exists (
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

-- -----------------------------------------------------------------------------
-- What an admin may edit
-- -----------------------------------------------------------------------------

-- Name, description, participant limit and status. Nothing else.
--
-- THIS IS THE ESCALATION GUARD. The UPDATE policy below has to grant UPDATE on
-- the row, and that reaches every column — including admin_id. An admin who
-- could write it would make themselves the founder and gain the one right the
-- founder rank exists to withhold. Moving the group to another course or
-- another university is blocked here for the same reason.
--
-- THE FOUNDER CAN BE RETIRED, NEVER REPLACED, and the difference is not a
-- nicety. admin_id is `on delete set null`, so deleting the founder's account
-- makes PostgreSQL run `update study_groups set admin_id = null` — as
-- supabase_auth_admin, which is not service_role and therefore not exempt. A
-- blanket freeze on the column refuses that update, and refusing it means the
-- account deletion fails: a student who once created a study group could never
-- leave the product. Allowing only the transition to NULL keeps the escalation
-- closed (X to Y is still refused) and lets the cascade through.
create or replace function public.freeze_study_group()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('role', true) is distinct from 'service_role' then
    if new.id is distinct from old.id
       or new.course_offering_id is distinct from old.course_offering_id
       or new.university_id is distinct from old.university_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Only a group''s name, description, size and status can be changed.'
        using errcode = '42501';
    end if;

    if new.admin_id is distinct from old.admin_id and new.admin_id is not null then
      raise exception 'A group''s founder cannot be changed.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger study_groups_freeze
  before update on public.study_groups
  for each row execute function public.freeze_study_group();

-- The participant limit cannot be set below the people already in the group.
--
-- A CHECK constraint cannot see another table, so this is a trigger. Without it
-- an admin sets the limit to 2 with six members present, and check_group_capacity
-- then reports a group that is permanently over capacity — a state nothing can
-- leave, because leaving is what it blocks.
create or replace function public.check_group_limit_fits_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  occupied integer;
begin
  if new.max_participants >= old.max_participants then
    return new;
  end if;

  select count(*) into occupied
  from public.study_group_members m
  where m.group_id = new.id;

  if new.max_participants < occupied then
    raise exception 'The group already has % members; the limit cannot be lower.', occupied
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger study_groups_limit_fits_members
  before update on public.study_groups
  for each row execute function public.check_group_limit_fits_members();

-- -----------------------------------------------------------------------------
-- Promotion, demotion, and the two ranks
-- -----------------------------------------------------------------------------

-- The rules RLS cannot express.
--
-- The UPDATE policy can only ask "is the caller an admin of this group?". It
-- cannot say "only the founder may demote", because that depends on the values
-- being written and on which row is being written to.
create or replace function public.check_group_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_founder uuid;
begin
  -- A membership is a fact about a person in a group. Only the rank may move.
  if new.group_id is distinct from old.group_id
     or new.profile_id is distinct from old.profile_id
     or new.joined_at is distinct from old.joined_at then
    raise exception 'A membership cannot be reassigned.'
      using errcode = '42501';
  end if;

  if new.role = old.role then
    return new;
  end if;

  select g.admin_id into v_founder
  from public.study_groups g
  where g.id = new.group_id;

  -- The founder's rank is not a decision anyone gets to make, including theirs.
  -- Checked for every caller: this is an invariant of the group, not a question
  -- of who is asking.
  if v_founder is not null and old.profile_id = v_founder and new.role <> 'admin' then
    raise exception 'The group''s founder cannot be demoted.'
      using errcode = '42501';
  end if;

  -- Demotion is the founder's alone. Promotion is not: any admin may grant the
  -- rank, which is what makes co-admins useful.
  --
  -- Exempt for service_role, as freeze_group_request is: this clause is about
  -- WHO is asking, and support tooling has no auth.uid() to answer with.
  if current_setting('role', true) is distinct from 'service_role'
     and old.role = 'admin' and new.role = 'member'
     and (v_founder is null or auth.uid() is distinct from v_founder) then
    raise exception 'Only the group''s founder can demote an admin.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger study_group_members_role_change
  before update on public.study_group_members
  for each row execute function public.check_group_role_change();

-- Removing a member is subject to the same two ranks.
--
-- Without this, "regular admins cannot demote each other" is decoration: an
-- admin would simply DELETE the other admin's membership, which is demotion and
-- eviction at once.
create or replace function public.check_group_member_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_founder uuid;
begin
  if current_setting('role', true) is not distinct from 'service_role' then
    return old;
  end if;

  -- The student's account is being deleted; this is a cascade, not an eviction.
  -- Nothing about a group may block someone from leaving the product.
  if not exists (select 1 from public.profiles p where p.id = old.profile_id) then
    return old;
  end if;

  select g.admin_id into v_founder
  from public.study_groups g
  where g.id = old.group_id;

  if v_founder is not null and old.profile_id = v_founder then
    raise exception 'The group''s founder cannot be removed from it.'
      using errcode = '42501';
  end if;

  if old.role = 'admin'
     and old.profile_id is distinct from auth.uid()
     and (v_founder is null or auth.uid() is distinct from v_founder) then
    raise exception 'Only the group''s founder can remove another admin.'
      using errcode = '42501';
  end if;

  return old;
end;
$$;

create trigger study_group_members_removal
  before delete on public.study_group_members
  for each row execute function public.check_group_member_removal();

-- A group that still has members must still have an admin.
--
-- AFTER, so the count includes the change being made. An admin-less group is
-- unadministrable and has no recovery path: nobody can approve a request, edit
-- the group, or promote anyone.
create or replace function public.ensure_group_keeps_an_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group   uuid := coalesce(new.group_id, old.group_id);
  v_admins  integer;
  v_members integer;
begin
  if tg_op = 'UPDATE' and not (old.role = 'admin' and new.role <> 'admin') then
    return new;
  end if;

  if tg_op = 'DELETE' and old.role <> 'admin' then
    return old;
  end if;

  select
    count(*) filter (where m.role = 'admin'),
    count(*)
  into v_admins, v_members
  from public.study_group_members m
  where m.group_id = v_group;

  if v_admins > 0 or v_members = 0 then
    return coalesce(new, old);
  end if;

  -- A deliberate demotion or departure: refuse it, and say why.
  if tg_op = 'UPDATE' or exists (select 1 from public.profiles p where p.id = old.profile_id) then
    raise exception 'A group must keep at least one admin.'
      using errcode = '23514';
  end if;

  -- A cascade from a deleted account. Refusing is not available — that would
  -- make closing an account fail — so the group heals instead: the longest
  -- standing member inherits the rank. An unattended group is worse than an
  -- unexpected promotion, and every member of it asked to be there.
  update public.study_group_members m
  set role = 'admin'
  where m.group_id = v_group
    and m.profile_id = (
      select m2.profile_id
      from public.study_group_members m2
      where m2.group_id = v_group
      order by m2.joined_at, m2.profile_id
      limit 1
    );

  return old;
end;
$$;

create trigger study_group_members_keep_an_admin
  after update or delete on public.study_group_members
  for each row execute function public.ensure_group_keeps_an_admin();

-- -----------------------------------------------------------------------------
-- Grants and policies
-- -----------------------------------------------------------------------------

grant update on public.study_group_members to authenticated;

-- Any admin may change a rank; the triggers above decide which changes are legal.
create policy "an admin can change a member's role"
  on public.study_group_members for update to authenticated
  using (public.app_is_group_admin(group_id))
  with check (public.app_is_group_admin(group_id));

-- The group edit policy moves from the founder to every admin. Editing the name
-- and the participant limit is the Phase 7A requirement; freeze_study_group()
-- bounds what "editing" reaches.
drop policy "the admin can update their group" on public.study_groups;

create policy "an admin can update their group"
  on public.study_groups for update to authenticated
  using (public.app_is_group_admin(id))
  with check (public.app_is_group_admin(id));

-- Leaving and removal, restated for two ranks. An admin may now leave a group
-- that still has another admin — Phase 5 forbade it because leaving would have
-- orphaned the group, and that is now the keep-an-admin trigger's job.
drop policy "you can leave, or be removed by the admin" on public.study_group_members;

create policy "you can leave, or be removed by an admin"
  on public.study_group_members for delete to authenticated
  using (
    profile_id = auth.uid()
    or (public.app_is_group_admin(group_id) and profile_id <> auth.uid())
  );

-- -----------------------------------------------------------------------------
-- Deciding a request, when several admins are looking at it
-- -----------------------------------------------------------------------------

-- Unchanged except for one clause: the row is locked before it is read.
--
-- WHY `for update` MATTERS HERE. "The first admin to respond decides" is a race
-- between two transactions. At READ COMMITTED both can pass a bare
-- `where status = 'pending'` read, and both proceed to update. The freeze
-- trigger still catches the loser — its UPDATE re-reads the row and sees a
-- decided status — but it catches it as a raw trigger error after the work has
-- begun. Locking the row makes the second admin wait for the first to commit and
-- then fail the status test cleanly, which is the same outcome reached honestly.
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
  where r.id = p_request_id
    and r.status = 'pending'
    and exists (
      select 1
      from public.study_group_members m
      where m.group_id = r.group_id
        and m.profile_id = auth.uid()
        and m.role = 'admin'
    )
  for update of r;

  if v_group_id is null then
    raise exception 'That request is not yours to decide, or has already been decided.'
      using errcode = '42501';
  end if;

  update public.group_requests
  set status = 'approved',
      decided_at = now(),
      decided_by = auth.uid()
  where id = p_request_id;

  insert into public.study_group_members (group_id, profile_id)
  values (v_group_id, v_requester_id);

  select p.full_name into v_full_name
  from public.profiles p
  where p.id = v_requester_id;

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
  'Approves a join request, adds the member and posts the welcome system message in ONE transaction. Locks the request row so that when two admins answer at once the second is refused rather than racing. Restates its own authorisation because definer rights bypass RLS.';

-- Rejection, as an RPC rather than a bare UPDATE.
--
-- Phase 5 rejected by updating the row from the application, which was fine when
-- one person could see the request. With several admins the two paths must
-- behave the same way under a race, and that means both locking the row and both
-- returning the same refusal.
create or replace function public.rpc_reject_group_request(
  p_request_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid;
begin
  select r.group_id
  into v_group_id
  from public.group_requests r
  where r.id = p_request_id
    and r.status = 'pending'
    and exists (
      select 1
      from public.study_group_members m
      where m.group_id = r.group_id
        and m.profile_id = auth.uid()
        and m.role = 'admin'
    )
  for update of r;

  if v_group_id is null then
    raise exception 'That request is not yours to decide, or has already been decided.'
      using errcode = '42501';
  end if;

  update public.group_requests
  set status = 'rejected',
      decision_note = nullif(btrim(coalesce(p_note, '')), ''),
      decided_at = now(),
      decided_by = auth.uid()
  where id = p_request_id;

  return v_group_id;
end;
$$;

comment on function public.rpc_reject_group_request is
  'Rejects a join request under the same row lock as approval, so two admins answering at once produce one decision and one clean refusal.';

revoke execute on function public.rpc_reject_group_request(uuid, text) from public;
grant execute on function public.rpc_reject_group_request(uuid, text) to authenticated;
