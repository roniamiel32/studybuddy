-- =============================================================================
-- File:        supabase/migrations/20260811110000_group_invitations.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Phase 7B — admins add members by INVITING them.
--
--              THE REQUIREMENT was "admins can add users to the group". The
--              Phase 5 policy forbids exactly that, and says why: "without the
--              request check an admin could add any classmate to a group without
--              consent." That reasoning did not expire. Being added to a group
--              means being added to a chat whose history you can then read, by
--              someone who may be a stranger.
--
--              So an invitation is a REQUEST IN THE OTHER DIRECTION, and it
--              reuses the request machinery rather than copying it: one live row
--              per student per group, decided once, frozen afterwards, never
--              deleted. Only the answer to "who decides?" flips.
--
--                kind = 'request'  the student asks, any admin decides
--                kind = 'invite'   an admin asks, THE STUDENT decides
--
--              WHAT THE UNIQUE INDEX IS DOING, and why it is untouched. It keys
--              on (group_id, requester_id) for live rows WITHOUT kind, so a
--              student cannot hold a pending request and a pending invite at the
--              same time. Adding kind to it would allow both — and since the
--              invitee decides invites, they could then approve their own way in
--              while their request was still waiting on an admin.
-- Version:     0.19.0
--
-- Modifications:
--     0.19.0 - 2026-08-11 - Initial schema (Phase 7B)
-- =============================================================================

create type group_request_kind as enum ('request', 'invite');

comment on type group_request_kind is
  'Which way the asking runs. request: student to admins. invite: admin to student. The decider is the other party in both cases.';

alter table group_requests
  add column kind group_request_kind not null default 'request',
  add column invited_by uuid references profiles (id) on delete set null;

comment on column group_requests.requester_id is
  'The student who would join. They author a request; they are the subject of an invite and the one who decides it.';

comment on column group_requests.invited_by is
  'The admin who sent the invitation. Null for a student-authored request.';

-- The two columns must agree, in both directions: an invite names its inviter,
-- a request has none to name.
alter table group_requests
  add constraint group_requests_invite_has_inviter
    check ((kind = 'invite') = (invited_by is not null));

-- "My pending invitations" is its own screen, and it is a different question
-- from "my pending requests".
create index group_requests_invitee_idx
  on group_requests (requester_id, kind, status)
  where status = 'pending';

-- -----------------------------------------------------------------------------
-- Freezing, extended
-- -----------------------------------------------------------------------------

-- kind and invited_by join the frozen set.
--
-- Both decide WHO IS ALLOWED TO DECIDE the row. A student who could flip a
-- pending request of theirs to an invite would hand themselves the decision.
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
       or new.created_at is distinct from old.created_at
       or new.kind is distinct from old.kind
       or new.invited_by is distinct from old.invited_by then
      raise exception 'A request cannot be reassigned.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Policies
-- -----------------------------------------------------------------------------

-- The Phase 5 insert policy, now restricted to student-authored requests.
--
-- THE RESTRICTION IS THE WHOLE POINT. Policies are permissive and OR together,
-- so without `kind = 'request'` here a student could insert their own row with
-- kind = 'invite' and then decide it themselves under the invitee policy below —
-- joining any open group in their course with no admin involved at all.
drop policy "you can ask to join a group you can see" on public.group_requests;

create policy "you can ask to join a group you can see"
  on public.group_requests for insert to authenticated
  with check (
    kind = 'request'
    and requester_id = auth.uid()
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

-- An admin invites a classmate who takes the course.
--
-- The enrolment requirement mirrors app_can_see_group from the request side: a
-- student can only ask to join a group they can see, so they can only be invited
-- to one they could have found themselves. Without it an admin could pull in
-- anyone at the university, including students with no connection to the course.
create policy "an admin can invite a classmate"
  on public.group_requests for insert to authenticated
  with check (
    kind = 'invite'
    and status = 'pending'
    and invited_by = auth.uid()
    and public.app_is_group_admin(group_id)
    and requester_id <> auth.uid()
    and exists (
      select 1
      from public.study_groups g
      join public.enrollments e
        on e.course_offering_id = g.course_offering_id
       and e.profile_id = group_requests.requester_id
      where g.id = group_requests.group_id
    )
    and not exists (
      select 1
      from public.study_group_members m
      where m.group_id = group_requests.group_id
        and m.profile_id = group_requests.requester_id
    )
  );

-- The invitee decides their own invitation. The Phase 5 update policy already
-- covers an admin deciding a request; this is its mirror.
create policy "you can answer an invitation addressed to you"
  on public.group_requests for update to authenticated
  using (kind = 'invite' and requester_id = auth.uid())
  with check (
    kind = 'invite'
    and requester_id = auth.uid()
    and status in ('approved', 'rejected')
  );

-- An admin should not be able to decide an invitation on the student's behalf —
-- that would be the direct add this migration exists to avoid. The Phase 5
-- policy grants update to admins for any row in their group, so it is narrowed
-- to requests here.
drop policy "the admin can decide a request" on public.group_requests;

create policy "an admin can decide a join request"
  on public.group_requests for update to authenticated
  using (kind = 'request' and public.app_is_group_admin(group_id))
  with check (
    kind = 'request'
    and public.app_is_group_admin(group_id)
    and status in ('approved', 'rejected')
  );

-- The invitee must be able to SEE the invitation. requester_id = auth.uid()
-- already covers it in the Phase 5 select policy, which is why that one is not
-- rewritten: the student who would join is the requester in both directions.

-- -----------------------------------------------------------------------------
-- Approval, for both directions
-- -----------------------------------------------------------------------------

-- One authorisation branch per kind. Everything after it — the membership
-- insert, the capacity trigger, the welcome message — is shared, because
-- joining a group is the same event however it was proposed.
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
    and (
      -- A student asked; any admin may say yes.
      (
        r.kind = 'request'
        and exists (
          select 1
          from public.study_group_members m
          where m.group_id = r.group_id
            and m.profile_id = auth.uid()
            and m.role = 'admin'
        )
      )
      -- An admin asked; only the student themselves may say yes. This line is
      -- the consent rule, restated where definer rights bypass RLS.
      or (r.kind = 'invite' and r.requester_id = auth.uid())
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
  'Approves a request or accepts an invitation, adds the member and posts the welcome message in ONE transaction. A request is decided by any admin; an invitation only by the student it names — the Phase 5 consent rule, restated inside a definer function.';

-- Rejection and declining, likewise.
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
    and (
      (
        r.kind = 'request'
        and exists (
          select 1
          from public.study_group_members m
          where m.group_id = r.group_id
            and m.profile_id = auth.uid()
            and m.role = 'admin'
        )
      )
      or (r.kind = 'invite' and r.requester_id = auth.uid())
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
  'Rejects a join request or declines an invitation, under the same row lock and the same two authorisation branches as approval.';
