-- =============================================================================
-- File:        supabase/migrations/20260805100000_tracks_and_preferences.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Study tracks, and the reworked preference questionnaire.
--
--              Two product requirements drive this migration:
--
--              1. The course picker must show every course in the student's
--                 study track, never filtered by year of study. That makes the
--                 track a structural entity rather than the free-text
--                 `degree_program` it was, and courses must be associated with
--                 it. The association is many-to-many on purpose: Linear
--                 Algebra genuinely belongs to Computer Science, Data Science
--                 and Economics, and duplicating the course per track would
--                 split the very pool that matching depends on.
--
--              2. Three of the four preference questions are MULTI-SELECT. The
--                 original single-value enums cannot express "mornings and
--                 evenings", so they are replaced with enum arrays.
--
--              Destructive by design: columns are dropped, not deprecated. The
--              application has never been deployed and holds no real data, so
--              carrying a compatibility shim to nowhere would be dead weight.
-- Version:     0.6.0
--
-- Modifications:
--     0.6.0 - 2026-08-05 - Study tracks and multi-select preferences (Phase 1c)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Study tracks
-- -----------------------------------------------------------------------------

create table study_tracks (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities (id) on delete cascade,
  code          text not null check (char_length(code) between 2 and 32),
  name          text not null check (char_length(name) between 2 and 120),
  created_at    timestamptz not null default now(),
  constraint study_tracks_code_unique_per_university unique (university_id, code)
);

comment on table study_tracks is
  'A degree programme. Drives the default course list during onboarding; students can still search the whole catalog for off-track courses.';

create index study_tracks_university_idx on study_tracks (university_id);

-- Many-to-many. A shared course such as Linear Algebra belongs to several
-- tracks, and it must remain ONE course so that everyone taking it lands in the
-- same matching pool.
create table course_tracks (
  course_id  uuid not null references courses (id) on delete cascade,
  track_id   uuid not null references study_tracks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (course_id, track_id)
);

create index course_tracks_track_idx on course_tracks (track_id);

-- -----------------------------------------------------------------------------
-- profiles: study_track_id replaces the free-text degree_program
-- -----------------------------------------------------------------------------

alter table profiles
  add column study_track_id uuid references study_tracks (id) on delete set null;

alter table profiles drop column degree_program;

comment on column profiles.study_track_id is
  'The student''s degree programme. Nullable until onboarding step 1 is complete.';

create index profiles_study_track_idx on profiles (study_track_id);

-- A foreign key cannot express "the track must belong to the same university as
-- the profile", because that spans two tables. Without this a student could be
-- put on another institution's track, which would then leak that institution's
-- courses into their picker.
create or replace function public.enforce_profile_track_university()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_track_university uuid;
begin
  if new.study_track_id is null then
    return new;
  end if;

  select t.university_id
    into v_track_university
  from public.study_tracks t
  where t.id = new.study_track_id;

  if v_track_university is distinct from new.university_id then
    raise exception 'A study track must belong to the student''s own university.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger profiles_track_matches_university
  before insert or update of study_track_id, university_id on public.profiles
  for each row execute function public.enforce_profile_track_university();

-- Same reasoning for the join table.
create or replace function public.enforce_course_track_university()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_course_university uuid;
  v_track_university  uuid;
begin
  select c.university_id into v_course_university
  from public.courses c where c.id = new.course_id;

  select t.university_id into v_track_university
  from public.study_tracks t where t.id = new.track_id;

  if v_course_university is distinct from v_track_university then
    raise exception 'A course cannot be attached to another institution''s track.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger course_tracks_same_university
  before insert or update on public.course_tracks
  for each row execute function public.enforce_course_track_university();

-- -----------------------------------------------------------------------------
-- Preferences, reworked to the agreed questionnaire
-- -----------------------------------------------------------------------------

create type time_block as enum ('morning', 'noon', 'evening', 'other');
create type study_environment as enum ('discussion', 'quiet');
create type group_size_choice as enum ('small', 'large');

alter table learning_preferences
  drop column study_style,
  drop column noise_preference,
  drop column place_preference,
  drop column group_size_preference,
  drop column pace,
  drop column goal,
  drop column notes;

alter table learning_preferences
  add column preferred_time_blocks time_block[] not null
    check (array_length(preferred_time_blocks, 1) between 1 and 4),
  add column study_environments study_environment[] not null
    check (array_length(study_environments, 1) between 1 and 2),
  add column group_sizes group_size_choice[] not null
    check (array_length(group_sizes, 1) between 1 and 2),
  add column studies_on_saturday boolean not null;

comment on column learning_preferences.preferred_time_blocks is
  'Multi-select: a student who is free mornings AND evenings is a better match for both than one forced to pick a single slot.';

comment on table learning_preferences is
  'The student''s DEFAULT preferences. Per-course overrides are a planned extension; nothing here assumes these are global forever.';

-- The old single-value enums have no remaining users.
drop type study_style;
drop type noise_preference;
drop type place_preference;
drop type group_size;
drop type study_pace;
drop type study_goal;

-- -----------------------------------------------------------------------------
-- Security for the new tables
--
-- Reference data, readable within your own university and writable only by the
-- service role. RLS is enabled BEFORE the policies exist, so there is no window
-- in which the tables are world-readable.
-- -----------------------------------------------------------------------------

alter table study_tracks  enable row level security;
alter table course_tracks enable row level security;

create policy "tracks are visible within your university"
  on public.study_tracks for select to authenticated
  using (university_id = public.app_current_university_id());

-- Inherits its tenant from the course. The subquery runs under the courses
-- policy, so a mapping belonging to another institution finds no course and is
-- filtered out.
create policy "course-track links are visible within your university"
  on public.course_tracks for select to authenticated
  using (
    exists (
      select 1
      from public.courses c
      where c.id = course_tracks.course_id
        and c.university_id = public.app_current_university_id()
    )
  );

-- The Phase 1a blanket grant only covered tables that existed then, so new
-- tables need their own.
grant all privileges on public.study_tracks  to service_role;
grant all privileges on public.course_tracks to service_role;
grant select on public.study_tracks  to authenticated;
grant select on public.course_tracks to authenticated;
