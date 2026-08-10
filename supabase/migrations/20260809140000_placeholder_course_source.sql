-- -----------------------------------------------------------------------------
-- File:        supabase/migrations/20260809140000_placeholder_course_source.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Adds 'placeholder' to course_source.
--
--              The Smart Course API must never leave a student on step 2 with an
--              empty list, because a student with no courses cannot be matched
--              on anything. When no model is configured it writes a stock
--              curriculum for the degree instead.
--
--              Those rows need their own provenance value, separate from
--              'ai_generated'. Both are unverified, but they are unverified in
--              different ways and need different handling: an 'ai_generated' row
--              is a model's attempt at this institution's real syllabus, while a
--              'placeholder' row is a generic curriculum that was never about
--              this institution at all. Keeping them distinct is what makes it
--              possible to find and replace the placeholders later, once a key
--              is configured, without touching anything else.
-- Version:     0.11.0
--
-- Modifications:
--     0.11.0 - 2026-08-09 - Initial migration
-- -----------------------------------------------------------------------------

-- Postgres cannot add an enum value inside a transaction block that then uses
-- it, but adding alone is fine, and `if not exists` keeps this re-runnable.
alter type course_source add value if not exists 'placeholder';

comment on column courses.source is
  'Where this course came from. seed and registrar are authoritative; ai_generated is a model''s guess at this institution''s syllabus; placeholder is a generic curriculum for the degree, used when no model is configured. The last two are shown to students with an explicit "not verified" marker.';
