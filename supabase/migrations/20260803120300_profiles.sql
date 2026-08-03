-- =============================================================================
-- File:        supabase/migrations/20260803120300_profiles.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Student identity, contact details and learning preferences.
--              Contact details are a SEPARATE TABLE on purpose: PostgreSQL RLS
--              is table-level, so a phone number that must be visible only to
--              accepted partners cannot share a table with a name that is
--              visible university-wide.
-- Version:     0.3.0
--
-- Modifications:
--     0.3.0 - 2026-08-03 - Initial schema (Phase 1a)
-- =============================================================================

create table profiles (
  id                      uuid primary key references auth.users (id) on delete cascade,
  university_id           uuid not null references universities (id) on delete restrict,
  -- Nullable at creation: the row is created by a trigger the instant the auth
  -- user exists, which is before the student has told us their name. The check
  -- still guards every non-null value. Onboarding is what makes it non-null,
  -- and onboarding_completed_at is what gates access to the app.
  full_name               text check (char_length(full_name) between 2 and 80),
  avatar_url              text,
  degree_program          text check (char_length(degree_program) <= 120),
  year_of_study           smallint check (year_of_study between 1 and 8),
  bio                     text check (char_length(bio) <= 500),
  is_discoverable         boolean not null default true,
  availability_mode       availability_mode not null default 'manual',
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table profiles is
  'Readable by other students in the same university when is_discoverable is true. Contact details live in profile_contacts.';

comment on column profiles.bio is
  'Student-authored free text. Treated as UNTRUSTED DATA when composed into an AI prompt (design section 6.3).';

comment on column profiles.availability_mode is
  'Decision D7. Drives which availability editor the UI shows; the matching query ignores it.';

-- Only discoverable profiles are ever scanned for candidates, so the partial
-- index matches the query shape exactly.
create index profiles_university_discoverable_idx
  on profiles (university_id)
  where is_discoverable;

-- -----------------------------------------------------------------------------
-- Contact details — the app's most sensitive data (decision D3).
-- -----------------------------------------------------------------------------

create table profile_contacts (
  profile_id        uuid primary key references profiles (id) on delete cascade,
  phone_e164        text not null check (phone_e164 ~ '^\+[1-9]\d{7,14}$'),
  whatsapp_opt_in   boolean not null default true,
  -- Reserved for the Phase 4 phone-verification stretch. Until then a student
  -- can enter a number that is not theirs; this is a known, documented gap
  -- (design section 6.2).
  phone_verified_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table profile_contacts is
  'Split from profiles because RLS is table-level, not column-level. Readable only by the owner and by students with an accepted connection.';

comment on column profile_contacts.whatsapp_opt_in is
  'False lets a student stay matchable without sharing a number. Checked before any wa.me link is built.';

-- -----------------------------------------------------------------------------
-- Learning preferences — the questionnaire.
-- -----------------------------------------------------------------------------

create table learning_preferences (
  profile_id            uuid primary key references profiles (id) on delete cascade,
  study_style           study_style not null,
  noise_preference      noise_preference not null,
  place_preference      place_preference not null,
  group_size_preference group_size not null,
  pace                  study_pace not null,
  goal                  study_goal not null,
  spoken_languages      text[] not null default '{he}'
                          check (array_length(spoken_languages, 1) between 1 and 5),
  notes                 text check (char_length(notes) <= 400),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table learning_preferences is
  'Separate from profiles so the questionnaire can grow without touching the identity row. Row exists only once submitted, which is why every answer is NOT NULL.';

comment on column learning_preferences.notes is
  'Student-authored free text. UNTRUSTED DATA in AI prompts (design section 6.3).';
