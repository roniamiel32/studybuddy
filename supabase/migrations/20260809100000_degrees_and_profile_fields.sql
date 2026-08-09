-- =============================================================================
-- File:        supabase/migrations/20260809100000_degrees_and_profile_fields.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Degrees, the personal fields the reworked onboarding collects,
--              study format, and course provenance.
--
--              THE SHAPE: universities -> degrees -> study_tracks. What the
--              schema previously called a "study track" was really a degree
--              ("Computer Science", "Law"), so those rows are promoted to
--              degrees and each keeps a track of the same name as its default
--              specialisation. Courses hang off the DEGREE, because that is what
--              the course API fetches on.
--
--              degree_level lives on `degrees`, not on `profiles`. A degree IS a
--              level; storing it in both places would let a student's stated
--              level disagree with the degree they picked, and nothing could
--              then say which was right.
-- Version:     0.9.0
--
-- Modifications:
--     0.9.0 - 2026-08-09 - Degrees, DOB, city, study format, course provenance
-- =============================================================================

create type degree_level as enum ('bachelors', 'masters', 'phd');
create type study_format as enum ('in_person', 'remote');
create type course_source as enum ('seed', 'registrar', 'ai_generated');

-- -----------------------------------------------------------------------------
-- Degrees
-- -----------------------------------------------------------------------------

create table degrees (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities (id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 120),
  level         degree_level not null,
  created_at    timestamptz not null default now(),
  constraint degrees_unique_per_university unique (university_id, name, level)
);

comment on table degrees is
  'A named programme at a level, e.g. "Computer Science" at bachelors. The unit the course API fetches a syllabus for.';

create index degrees_university_level_idx on degrees (university_id, level);

alter table study_tracks
  add column degree_id uuid references degrees (id) on delete cascade;

/*
 * Promote any EXISTING track to a degree at bachelors level, and link it.
 *
 * On a fresh `supabase db reset` this is a no-op, because seeds run after
 * migrations and study_tracks is still empty — the seed creates degrees
 * explicitly instead. This block exists for a database that already holds data,
 * so upgrading it does not require re-seeding.
 */
insert into degrees (university_id, name, level)
select t.university_id, t.name, 'bachelors'
from study_tracks t
on conflict (university_id, name, level) do nothing;

update study_tracks t
set degree_id = d.id
from degrees d
where d.university_id = t.university_id
  and d.name = t.name
  and d.level = 'bachelors';

/*
 * NOT NULL only once every existing row has a degree. A track with no degree
 * has no course catalog to draw on, so the constraint is worth enforcing rather
 * than leaving nullable "for safety".
 */
alter table study_tracks alter column degree_id set not null;

comment on column study_tracks.degree_id is
  'The degree this specialisation belongs to. Most degrees currently have a single track carrying the degree''s own name.';

create index study_tracks_degree_idx on study_tracks (degree_id);

-- A track must belong to a degree at the same university as the track itself.
create or replace function public.enforce_track_degree_university()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_degree_university uuid;
begin
  select d.university_id into v_degree_university
  from public.degrees d where d.id = new.degree_id;

  if v_degree_university is distinct from new.university_id then
    raise exception 'A track and its degree must belong to the same university.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger study_tracks_degree_same_university
  before insert or update of degree_id, university_id on public.study_tracks
  for each row execute function public.enforce_track_degree_university();

-- -----------------------------------------------------------------------------
-- profiles: degree, city
-- -----------------------------------------------------------------------------

alter table profiles
  add column degree_id uuid references degrees (id) on delete set null,
  add column city text check (char_length(city) between 2 and 80);

comment on column profiles.city is
  'Self-reported, and visible to classmates — it powers the geographic-proximity bonus and is worth showing rather than hiding.';

create index profiles_degree_idx on profiles (degree_id);
create index profiles_city_idx on profiles (university_id, lower(city));

-- Backfill from the track the student already chose, so nobody has to redo
-- step 1 because the schema changed underneath them.
update profiles p
set degree_id = t.degree_id
from study_tracks t
where t.id = p.study_track_id;

-- Same-university guard, as for tracks.
create or replace function public.enforce_profile_degree_university()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_degree_university uuid;
begin
  if new.degree_id is null then
    return new;
  end if;

  select d.university_id into v_degree_university
  from public.degrees d where d.id = new.degree_id;

  if v_degree_university is distinct from new.university_id then
    raise exception 'A degree must belong to the student''s own university.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger profiles_degree_matches_university
  before insert or update of degree_id, university_id on public.profiles
  for each row execute function public.enforce_profile_degree_university();

-- -----------------------------------------------------------------------------
-- Date of birth — a SEPARATE TABLE, for the same reason as profile_contacts
--
-- RLS is table-level. `profiles` is readable by every discoverable classmate in
-- the same university, so a date of birth stored there would be visible to all
-- of them. It is only ever needed to compute an age GAP, which the matching
-- function does with definer rights — the raw date never has to leave the
-- database.
-- -----------------------------------------------------------------------------

create table profile_private (
  profile_id    uuid primary key references profiles (id) on delete cascade,
  date_of_birth date check (
    date_of_birth > current_date - interval '100 years'
    and date_of_birth < current_date - interval '14 years'
  ),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table profile_private is
  'Personal data no classmate may read. Only the owner can select it; matching reads it via a SECURITY DEFINER function and exposes an age gap, never a date.';

create trigger profile_private_set_updated_at
  before update on public.profile_private
  for each row execute function public.set_updated_at();

alter table profile_private enable row level security;

create policy "your private details are yours alone"
  on public.profile_private for select to authenticated
  using (profile_id = auth.uid());

create policy "you can add your own private details"
  on public.profile_private for insert to authenticated
  with check (profile_id = auth.uid());

create policy "you can update your own private details"
  on public.profile_private for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "you can delete your own private details"
  on public.profile_private for delete to authenticated
  using (profile_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Study format
-- -----------------------------------------------------------------------------

alter table learning_preferences
  add column study_formats study_format[] not null default '{in_person,remote}'
    check (array_length(study_formats, 1) between 1 and 2);

comment on column learning_preferences.study_formats is
  'In-person, remote, or both. A STRICT filter in matching: two students with disjoint formats can never study together, so no amount of other compatibility should surface them to each other.';

-- -----------------------------------------------------------------------------
-- Course provenance
--
-- An AI-generated course list is plausible, not authoritative. Recording where
-- a course came from is what lets the UI say so, and what lets a real catalog
-- replace the guesses later without touching anything else.
-- -----------------------------------------------------------------------------

alter table courses
  add column degree_id uuid references degrees (id) on delete set null,
  add column source course_source not null default 'seed',
  add column generated_at timestamptz;

comment on column courses.source is
  'Where this course came from. ai_generated rows are shown to students with an explicit "not verified" marker.';

create index courses_degree_idx on courses (degree_id);

-- Backfill: a course belongs to the degree of any track it is already mapped to.
update courses c
set degree_id = sub.degree_id
from (
  select ct.course_id, min(t.degree_id::text)::uuid as degree_id
  from course_tracks ct
  join study_tracks t on t.id = ct.track_id
  group by ct.course_id
) sub
where sub.course_id = c.id;

-- -----------------------------------------------------------------------------
-- Security for the new tables
-- -----------------------------------------------------------------------------

alter table degrees enable row level security;

create policy "degrees are visible within your university"
  on public.degrees for select to authenticated
  using (university_id = public.app_current_university_id());

grant all privileges on public.degrees         to service_role;
grant all privileges on public.profile_private to service_role;
grant select on public.degrees to authenticated;
grant select, insert, update, delete on public.profile_private to authenticated;
