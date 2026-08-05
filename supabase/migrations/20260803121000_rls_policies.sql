-- =============================================================================
-- File:        supabase/migrations/20260803121000_rls_policies.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Row Level Security policies. Phase 1a enabled RLS with no
--              policies, which denied everything; this migration opens each
--              table deliberately, in the shape of design document §1.9.
--
--              THE CENTRAL INVARIANT: a student can only ever reach rows
--              belonging to their own university. It is asserted here, and
--              again in every application query's WHERE clause, so that a
--              mistake in either layer produces empty results rather than a
--              cross-institution leak.
--
--              Policies are PERMISSIVE and therefore OR'd together, so each one
--              below grants access rather than restricting it. Anything no
--              policy names stays denied. `anon` is given no policy at all.
-- Version:     0.5.0
--
-- Modifications:
--     0.5.0 - 2026-08-03 - Initial policies (Phase 1b)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Visibility helper
-- -----------------------------------------------------------------------------

-- Whether the caller is allowed to see another student at all.
--
-- SECURITY DEFINER is required rather than convenient: this is called from the
-- profiles policy itself, so reading profiles under RLS would re-enter that
-- policy and recurse. It discloses nothing new — it answers exactly the
-- question the profiles policy already answers.
--
-- An accepted connection keeps a partner visible even after they turn
-- discoverability off. Otherwise a student who stops looking for new partners
-- would vanish from the screens of people they had already agreed to meet.
create or replace function public.app_can_see_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = target_profile_id
      and p.university_id = public.app_current_university_id()
      and (p.is_discoverable or public.app_is_connected_to(p.id))
  );
$$;

comment on function public.app_can_see_profile is
  'True when the caller may see the given student: same university, and either discoverable or already connected.';

revoke execute on function public.app_can_see_profile(uuid) from public;
grant execute on function public.app_can_see_profile(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Immutability triggers
--
-- RLS cannot express "this column may not change"; a WITH CHECK sees only the
-- new row, never the old one. These triggers cover the gap for the two columns
-- where a silent edit would be a security problem.
-- -----------------------------------------------------------------------------

-- A student must not be able to move themselves into another institution.
create or replace function public.prevent_profile_tenant_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.university_id is distinct from old.university_id
     and current_setting('role', true) is distinct from 'service_role' then
    raise exception 'A profile cannot move between institutions.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_freeze_university
  before update on public.profiles
  for each row execute function public.prevent_profile_tenant_change();

-- The addressee of a request may accept or decline it. They must not be able to
-- rewrite what was sent to them: the icebreaker is what the requester actually
-- said, and it is reused verbatim in the WhatsApp handoff after acceptance.
create or replace function public.freeze_request_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('role', true) is distinct from 'service_role'
     and (
       new.requester_id is distinct from old.requester_id
       or new.addressee_id is distinct from old.addressee_id
       or new.course_offering_id is distinct from old.course_offering_id
       or new.icebreaker_text is distinct from old.icebreaker_text
       or new.student_note is distinct from old.student_note
     ) then
    raise exception 'The content of a study request cannot be edited after it is sent.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger connection_requests_freeze_content
  before update on public.connection_requests
  for each row execute function public.freeze_request_content();

-- =============================================================================
-- Reference data
-- =============================================================================

-- The institution list itself is public reference data — names and slugs, no
-- student information — and the signup screen needs it to explain which
-- domains are supported. Tenancy is enforced on the academic and personal
-- tables below, which is where it actually matters.
create policy "universities are readable by signed-in users"
  on public.universities for select to authenticated
  using (true);

create policy "domains are readable by signed-in users"
  on public.university_domains for select to authenticated
  using (true);

-- =============================================================================
-- Academic catalog — strictly tenant-scoped
-- =============================================================================

create policy "terms are visible within your university"
  on public.terms for select to authenticated
  using (university_id = public.app_current_university_id());

create policy "courses are visible within your university"
  on public.courses for select to authenticated
  using (university_id = public.app_current_university_id());

-- course_offerings has no university_id of its own; it inherits the tenant from
-- its course. The subquery runs under the courses policy above, so an offering
-- belonging to another institution simply finds no course and is filtered out.
create policy "offerings are visible within your university"
  on public.course_offerings for select to authenticated
  using (
    exists (
      select 1
      from public.courses c
      where c.id = course_offerings.course_id
        and c.university_id = public.app_current_university_id()
    )
  );

-- =============================================================================
-- Profiles
-- =============================================================================

create policy "you can read yourself and visible classmates"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.app_can_see_profile(id));

-- The row is normally created by the handle_new_user() trigger. This exists so
-- a profile can be recreated if that ever fails, and it pins the tenant to the
-- caller's own.
create policy "you can create only your own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "you can update only your own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- =============================================================================
-- Contact details — the strictest table in the schema (decision D3)
-- =============================================================================

-- A phone number is readable by its owner, and by someone who has an ACCEPTED
-- connection with them. A pending request grants nothing: consent is the
-- acceptance, not the asking.
create policy "contacts are readable by you and your accepted partners"
  on public.profile_contacts for select to authenticated
  using (profile_id = auth.uid() or public.app_is_connected_to(profile_id));

create policy "you can add only your own contact details"
  on public.profile_contacts for insert to authenticated
  with check (profile_id = auth.uid());

create policy "you can update only your own contact details"
  on public.profile_contacts for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "you can delete only your own contact details"
  on public.profile_contacts for delete to authenticated
  using (profile_id = auth.uid());

-- =============================================================================
-- Learning preferences and availability
--
-- Both are readable by visible classmates, because both feed the match score
-- and the "why you match" explanation shown on a match card.
-- =============================================================================

create policy "preferences are visible to you and visible classmates"
  on public.learning_preferences for select to authenticated
  using (profile_id = auth.uid() or public.app_can_see_profile(profile_id));

create policy "you can create only your own preferences"
  on public.learning_preferences for insert to authenticated
  with check (profile_id = auth.uid());

create policy "you can update only your own preferences"
  on public.learning_preferences for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "availability is visible to you and visible classmates"
  on public.availability_slots for select to authenticated
  using (profile_id = auth.uid() or public.app_can_see_profile(profile_id));

create policy "you can add only your own availability"
  on public.availability_slots for insert to authenticated
  with check (profile_id = auth.uid());

create policy "you can update only your own availability"
  on public.availability_slots for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "you can delete only your own availability"
  on public.availability_slots for delete to authenticated
  using (profile_id = auth.uid());

-- =============================================================================
-- Enrollments
-- =============================================================================

-- Visible for classmates too: finding out who else is taking a course is the
-- product. Restricted to profiles the caller can already see, so opting out of
-- discoverability also hides your timetable.
create policy "enrollments are visible for you and visible classmates"
  on public.enrollments for select to authenticated
  using (profile_id = auth.uid() or public.app_can_see_profile(profile_id));

-- university_id is written by set_enrollment_university() from the offering,
-- and BEFORE triggers run before WITH CHECK is evaluated. So requiring it to
-- equal the caller's tenant is what blocks enrolling in another institution's
-- course — the check tests the derived value, not what the client sent.
create policy "you can enroll only yourself, only in your university"
  on public.enrollments for insert to authenticated
  with check (
    profile_id = auth.uid()
    and university_id = public.app_current_university_id()
  );

create policy "you can update only your own enrollments"
  on public.enrollments for update to authenticated
  using (profile_id = auth.uid())
  with check (
    profile_id = auth.uid()
    and university_id = public.app_current_university_id()
  );

create policy "you can delete only your own enrollments"
  on public.enrollments for delete to authenticated
  using (profile_id = auth.uid());

-- =============================================================================
-- Connection requests (decision D2)
-- =============================================================================

create policy "you can read requests you are part of"
  on public.connection_requests for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- Only as the requester, only as pending, only within your own university, and
-- only to someone you can actually see.
create policy "you can send a request as yourself"
  on public.connection_requests for insert to authenticated
  with check (
    requester_id = auth.uid()
    and status = 'pending'
    and university_id = public.app_current_university_id()
    and public.app_can_see_profile(addressee_id)
  );

-- Two update policies rather than one, because the two sides of a request may
-- do different things. Permissive policies are OR'd, so each side gets exactly
-- its own transition and nothing else: a requester cannot accept on the
-- addressee's behalf, and an addressee cannot quietly cancel.
create policy "a requester can withdraw a pending request"
  on public.connection_requests for update to authenticated
  using (requester_id = auth.uid() and status = 'pending')
  with check (requester_id = auth.uid() and status in ('pending', 'cancelled'));

create policy "an addressee can accept or decline a pending request"
  on public.connection_requests for update to authenticated
  using (addressee_id = auth.uid() and status = 'pending')
  with check (addressee_id = auth.uid() and status in ('accepted', 'declined'));

-- =============================================================================
-- Blocks
-- =============================================================================

-- Deliberately one-directional: you can read the blocks you created, never the
-- ones naming you. Being able to detect that you have been blocked defeats the
-- purpose of blocking.
create policy "you can read your own block list"
  on public.blocked_users for select to authenticated
  using (blocker_id = auth.uid());

create policy "you can block on your own behalf"
  on public.blocked_users for insert to authenticated
  with check (blocker_id = auth.uid());

create policy "you can lift your own blocks"
  on public.blocked_users for delete to authenticated
  using (blocker_id = auth.uid());

-- =============================================================================
-- AI tables
-- =============================================================================

-- Read your own cached matches, and discard them to force a refresh. Writes are
-- service-role only: the cache is derived data, and a client that could write
-- it could rank itself first.
create policy "you can read your own match scores"
  on public.match_scores for select to authenticated
  using (profile_id = auth.uid());

create policy "you can discard your own match scores"
  on public.match_scores for delete to authenticated
  using (profile_id = auth.uid());

-- Read-only, and only your own. A client that could write or delete here could
-- erase its own rate limit.
create policy "you can read your own AI usage"
  on public.ai_generation_log for select to authenticated
  using (profile_id = auth.uid());
