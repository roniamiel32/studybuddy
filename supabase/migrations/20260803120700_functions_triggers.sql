-- =============================================================================
-- File:        supabase/migrations/20260803120700_functions_triggers.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Helper functions and triggers. The app_* helpers exist so RLS
--              predicates in Phase 1b stay cheap and non-recursive; the
--              triggers maintain the denormalised university_id columns and
--              updated_at stamps so the client never has to.
--
--              Every function sets an empty search_path and fully qualifies
--              its object references. A SECURITY DEFINER function with a
--              mutable search_path is a privilege-escalation vector: a caller
--              who can create objects in a schema earlier on the path can
--              shadow a table name and have it read with elevated rights.
-- Version:     0.3.0
--
-- Modifications:
--     0.3.0 - 2026-08-03 - Initial schema (Phase 1a)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'BEFORE UPDATE trigger. Stamps updated_at server-side so a client cannot backdate it.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger profile_contacts_set_updated_at
  before update on public.profile_contacts
  for each row execute function public.set_updated_at();

create trigger learning_preferences_set_updated_at
  before update on public.learning_preferences
  for each row execute function public.set_updated_at();

create trigger connection_requests_set_updated_at
  before update on public.connection_requests
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Tenant resolution at signup
-- -----------------------------------------------------------------------------

-- Creates the profile row the moment an auth user exists, resolving the tenant
-- from the email domain. Raising here is a deliberate backstop: the signup
-- server action rejects an unknown domain first with a friendly message, and
-- this makes it impossible to create an untenanted profile even if that check
-- is ever bypassed.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain        text;
  v_university_id uuid;
begin
  if new.email is null then
    raise exception 'StudyBuddy requires an email address to determine your institution.'
      using errcode = '23514';
  end if;

  v_domain := lower(split_part(new.email, '@', 2));

  select ud.university_id
    into v_university_id
  from public.university_domains ud
  where ud.domain = v_domain
    and ud.is_student_domain;

  if v_university_id is null then
    raise exception
      'No institution is registered for the email domain "%". Use your university address.',
      v_domain
      using errcode = '23514';
  end if;

  insert into public.profiles (id, university_id, full_name)
  values (
    new.id,
    v_university_id,
    -- Present when signup passed a name in metadata; otherwise onboarding
    -- collects it. Never invented from the email address.
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), '')
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Denormalised university_id maintenance
-- -----------------------------------------------------------------------------

create or replace function public.set_enrollment_university()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_university_id uuid;
begin
  select c.university_id
    into v_university_id
  from public.course_offerings o
  join public.courses c on c.id = o.course_id
  where o.id = new.course_offering_id;

  if v_university_id is null then
    raise exception 'Unknown course offering %', new.course_offering_id
      using errcode = '23503';
  end if;

  new.university_id := v_university_id;
  return new;
end;
$$;

comment on function public.set_enrollment_university is
  'Derives enrollments.university_id from the offering. Overwrites whatever the client sent, so the denormalised column cannot be forged or drift.';

create trigger enrollments_set_university
  before insert or update of course_offering_id on public.enrollments
  for each row execute function public.set_enrollment_university();

-- Same idea for requests, plus a cross-tenant guard. Deriving the tenant from
-- the offering and then asserting both parties belong to it makes a
-- cross-university request impossible at the storage layer, independently of
-- RLS and of application code.
create or replace function public.set_request_university()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_university_id uuid;
  v_mismatched    int;
begin
  select c.university_id
    into v_university_id
  from public.course_offerings o
  join public.courses c on c.id = o.course_id
  where o.id = new.course_offering_id;

  if v_university_id is null then
    raise exception 'Unknown course offering %', new.course_offering_id
      using errcode = '23503';
  end if;

  select count(*)
    into v_mismatched
  from public.profiles p
  where p.id in (new.requester_id, new.addressee_id)
    and p.university_id <> v_university_id;

  if v_mismatched > 0 then
    raise exception 'A study request cannot cross institutions.'
      using errcode = '23514';
  end if;

  new.university_id := v_university_id;
  return new;
end;
$$;

create trigger connection_requests_set_university
  before insert or update of course_offering_id on public.connection_requests
  for each row execute function public.set_request_university();

-- -----------------------------------------------------------------------------
-- RLS helpers (consumed by the Phase 1b policies)
-- -----------------------------------------------------------------------------

-- SECURITY DEFINER is required, not merely convenient: the profiles SELECT
-- policy compares against this value, so if the function read profiles under
-- RLS it would re-enter that same policy and recurse.
create or replace function public.app_current_university_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.university_id
  from public.profiles p
  where p.id = auth.uid();
$$;

comment on function public.app_current_university_id is
  'The caller''s tenant. SECURITY DEFINER to avoid recursing into the profiles policy that calls it. Returns only the caller''s own row, so it leaks nothing.';

-- Deliberately takes ONE argument and derives the other side from auth.uid().
-- A two-argument are_connected(a, b) would let any authenticated user probe the
-- relationship between two arbitrary strangers.
create or replace function public.app_is_connected_to(other_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.connection_requests r
    where r.status = 'accepted'
      and (
        (r.requester_id = auth.uid() and r.addressee_id = other_profile_id)
        or
        (r.addressee_id = auth.uid() and r.requester_id = other_profile_id)
      )
  );
$$;

comment on function public.app_is_connected_to is
  'True when the caller has an accepted connection with the given profile. Gates read access to profile_contacts, which is how phone numbers stay private until both sides consent.';

-- Weekly availability overlap in minutes, across every source.
--
-- Invoker rights on purpose: this reads availability_slots for two profiles, so
-- it must remain subject to RLS rather than becoming a way to read any
-- student's schedule.
create or replace function public.app_overlap_minutes(
  profile_a uuid,
  profile_b uuid
)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(
    sum(
      greatest(
        0,
        extract(epoch from (
          least(x.ends_at, y.ends_at) - greatest(x.starts_at, y.starts_at)
        )) / 60
      )
    )::int,
    0
  )
  from public.availability_slots x
  join public.availability_slots y
    on y.day_of_week = x.day_of_week
  where x.profile_id = profile_a
    and y.profile_id = profile_b;
$$;

comment on function public.app_overlap_minutes is
  'Total overlapping free minutes per week. Feeds the 0-40 point schedule term of the match score. Invoker rights so RLS still applies.';

-- Tighten execution: anonymous visitors have no reason to call any of these.
revoke execute on function public.app_current_university_id() from public;
revoke execute on function public.app_is_connected_to(uuid) from public;
revoke execute on function public.app_overlap_minutes(uuid, uuid) from public;

grant execute on function public.app_current_university_id() to authenticated;
grant execute on function public.app_is_connected_to(uuid) to authenticated;
grant execute on function public.app_overlap_minutes(uuid, uuid) to authenticated;
