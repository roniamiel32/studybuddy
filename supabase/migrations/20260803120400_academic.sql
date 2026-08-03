-- =============================================================================
-- File:        supabase/migrations/20260803120400_academic.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: The academic catalog and what students declare against it.
--              course_offerings is the term-scoped instance of a course and is
--              what students actually enroll in — without it the engine would
--              pair a student taking a course now with one who took it two
--              years ago.
-- Version:     0.3.0
--
-- Modifications:
--     0.3.0 - 2026-08-03 - Initial schema (Phase 1a)
-- =============================================================================

create table terms (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities (id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 60),
  starts_on     date not null,
  ends_on       date not null,
  is_current    boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint terms_dates_ordered check (ends_on > starts_on),
  constraint terms_name_unique_per_university unique (university_id, name)
);

-- At most one current term per university. A partial unique index expresses
-- this in the schema; enforcing it in application code would eventually fail.
create unique index terms_one_current_per_university_idx
  on terms (university_id)
  where is_current;

create table courses (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities (id) on delete cascade,
  code          text not null check (char_length(code) between 2 and 32),
  name          text not null check (char_length(name) between 2 and 160),
  faculty       text check (char_length(faculty) <= 120),
  created_at    timestamptz not null default now(),
  constraint courses_code_unique_per_university unique (university_id, code)
);

comment on table courses is
  'Seeded catalog (decision D1). Students pick from this list rather than typing course names, so matching is an integer join instead of fuzzy text.';

create index courses_university_code_idx on courses (university_id, code);

create table course_offerings (
  id         uuid primary key default gen_random_uuid(),
  course_id  uuid not null references courses (id) on delete cascade,
  term_id    uuid not null references terms (id) on delete cascade,
  lecturer   text check (char_length(lecturer) <= 120),
  created_at timestamptz not null default now(),
  constraint course_offerings_unique_per_term unique (course_id, term_id)
);

comment on table course_offerings is
  'A course in a specific term. This, not courses, is what a course dashboard is keyed on.';

create index course_offerings_term_idx on course_offerings (term_id);

-- -----------------------------------------------------------------------------
-- Enrollments
-- -----------------------------------------------------------------------------

create table enrollments (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references profiles (id) on delete cascade,
  course_offering_id uuid not null references course_offerings (id) on delete cascade,
  -- Denormalised from course_offerings -> courses. Every RLS predicate and
  -- every matching query filters by tenant; deriving this would put a two-join
  -- subquery inside a per-row security check. Written by trigger, never by the
  -- client, so it cannot drift.
  university_id      uuid not null references universities (id) on delete cascade,
  intent             enrollment_intent not null default 'want_partner',
  created_at         timestamptz not null default now(),
  constraint enrollments_unique_per_offering unique (profile_id, course_offering_id)
);

comment on column enrollments.university_id is
  'Denormalised for RLS and index efficiency. Maintained by set_enrollment_university(); do not write from the client.';

create index enrollments_offering_university_idx
  on enrollments (course_offering_id, university_id);

create index enrollments_profile_idx on enrollments (profile_id);

-- -----------------------------------------------------------------------------
-- Availability (decision D7)
-- -----------------------------------------------------------------------------

create table availability_slots (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles (id) on delete cascade,
  -- 0 = Sunday. The Israeli academic week starts on Sunday, and matching this
  -- to PostgreSQL's own extract(dow) convention avoids conversion bugs.
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at   time not null,
  ends_at     time not null,
  source      availability_source not null default 'manual',
  created_at  timestamptz not null default now(),
  constraint availability_slots_ordered check (ends_at > starts_at),
  -- source is part of the key so a calendar resync can delete and rewrite only
  -- its own provider's rows without discarding hand-added slots.
  constraint availability_slots_unique_start
    unique (profile_id, day_of_week, starts_at, source)
);

comment on table availability_slots is
  'Weekly recurring free time. Stored as rows rather than a bitmask because the UI edits them directly. A cached int[7] half-hour bitmask is the documented optimisation if overlap ever becomes the bottleneck.';

comment on column availability_slots.source is
  'Decision D7. manual rows are authored in the grid; provider rows are derived from a connected calendar and are read-only in the UI.';

create index availability_slots_profile_day_idx
  on availability_slots (profile_id, day_of_week);
