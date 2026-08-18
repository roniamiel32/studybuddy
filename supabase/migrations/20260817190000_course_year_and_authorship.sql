-- =============================================================================
-- File:        supabase/migrations/20260817190000_course_year_and_authorship.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Two columns the course catalog needs before students can add to
--              it themselves.
--
--              `year` is the academic year a course is normally taken in, and it
--              is NULLABLE ON PURPOSE. Null is not missing data — it is the
--              honest answer for an elective, a repeat, or a course nobody has
--              placed yet, and the UI groups those under "General & electives"
--              rather than guessing a number. A NOT NULL column here would have
--              forced every future import to invent one.
--
--              `is_user_generated` says a student typed this course into
--              existence rather than it arriving from a catalog. It overlaps
--              with `source` but does not duplicate it: source records WHERE a
--              row came from (seed / registrar / ai_generated / placeholder),
--              and this records WHO caused it to exist. A course the Smart
--              Course API guessed and a course a student asked for are both
--              'ai_generated' and are not the same thing to a reader deciding
--              whether to trust the list.
-- Version:     0.43.0
--
-- Modifications:
--     0.43.0 - 2026-08-17 - Initial implementation (year grouping, gatekeeper)
-- =============================================================================

alter table courses
  add column if not exists year smallint check (year between 1 and 4),
  add column if not exists is_user_generated boolean not null default false;

comment on column courses.year is
  'Academic year the course is normally taken in, 1-4. NULL means unplaced — an elective, or a course nobody has classified — and the UI groups those separately rather than inventing a year.';

comment on column courses.is_user_generated is
  'True when a student created this course through the add-a-course gatekeeper. Distinct from `source`, which records where a row came from rather than who caused it to exist.';

-- The course list is read degree-first and then grouped by year, which is
-- exactly this index. Without it the grouping re-sorts the whole degree.
create index if not exists courses_degree_year_idx on courses (degree_id, year);
