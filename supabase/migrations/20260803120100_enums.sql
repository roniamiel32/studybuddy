-- =============================================================================
-- File:        supabase/migrations/20260803120100_enums.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Enum types for StudyBuddy. Native PostgreSQL enums are used
--              rather than lookup tables because none of these values needs
--              per-row metadata, and an enum documents its own domain in the
--              schema.
-- Version:     0.3.0
--
-- Modifications:
--     0.3.0 - 2026-08-03 - Initial schema (Phase 1a)
-- =============================================================================

-- Learning preferences -------------------------------------------------------

create type study_style as enum (
  'solo_parallel',      -- sit together, work separately
  'discussion',         -- talk it through
  'teaching',           -- learn by explaining
  'problem_drilling'    -- grind past exams
);

create type noise_preference as enum ('silent', 'low_hum', 'lively');

create type place_preference as enum (
  'campus_library',
  'campus_open',
  'cafe',
  'online',
  'home'
);

create type group_size as enum ('pair', 'small_group', 'either');

create type study_pace as enum ('ahead_of_syllabus', 'on_track', 'catching_up');

create type study_goal as enum ('pass', 'high_grade', 'deep_understanding');

-- Academic -------------------------------------------------------------------

-- What a student wants out of a specific course. Drives the intent
-- complementarity term in the match score: can_tutor pairs well with need_help.
create type enrollment_intent as enum ('need_help', 'want_partner', 'can_tutor');

-- Availability (decision D7) -------------------------------------------------

-- Where an availability slot came from. Part of the uniqueness constraint on
-- availability_slots so that a calendar resync can replace only its own rows
-- and leave hand-added slots untouched.
create type availability_source as enum (
  'manual',
  'google_calendar',
  'apple_calendar'
);

-- Which editor is authoritative for a profile. Drives the UI only; the
-- matching query reads every slot regardless of source.
create type availability_mode as enum ('manual', 'calendar_sync');

-- Connections ----------------------------------------------------------------

create type connection_status as enum (
  'pending',
  'accepted',
  'declined',
  'cancelled',   -- withdrawn by the requester
  'expired'      -- aged out without an answer
);

-- AI -------------------------------------------------------------------------

create type ai_task as enum ('match_rerank', 'icebreaker');

create type ai_status as enum ('ok', 'error', 'rate_limited', 'invalid_output');
