-- =============================================================================
-- File:        supabase/migrations/20260813090000_academic_year_prompt.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: "Did you move up a year?", asked once each autumn.
--
--              WHY THE APP HAS TO ASK AT ALL. year_of_study is answered once, in
--              onboarding, and then quietly rots: a second-year who signs up in
--              October is a third-year the following October, and nothing in the
--              product ever notices. It feeds matching and it is on every
--              profile, so a stale one is wrong in public.
--
--              ONE COLUMN, NOT TWO. The date carries both meanings — "asked, do
--              not ask again this year" and "snoozed, ask again next week" —
--              because the question the app needs answered is only ever "may I
--              ask now?". A second `snooze_until` would have to be kept
--              consistent with this one, and two columns that must agree are two
--              columns that eventually will not. See the note on the snooze in
--              features/profile/actions.ts for how a week is expressed in it.
-- Version:     0.24.0
--
-- Modifications:
--     0.24.0 - 2026-08-13 - Initial implementation (Phase 9B)
-- =============================================================================

alter table profiles
  add column last_year_prompt_date timestamptz;

comment on column profiles.last_year_prompt_date is
  'When the student was last asked whether they had advanced a year, and answered or postponed. Null means never asked. The prompt is offered again six months after this date, so answering settles the question for the academic year while a postponement can set it to a date that comes back round in a week.';

-- Read on every authenticated page load, filtered on the row's own id, so the
-- primary key already covers it. No index here on purpose: one that is never the
-- selective term is write cost for nothing.

-- -----------------------------------------------------------------------------
-- Moving up a year
-- -----------------------------------------------------------------------------

-- WHY A FUNCTION RATHER THAN AN UPDATE FROM THE CLIENT. The new year is a
-- function of the old one, and PostgREST cannot send `year_of_study + 1` — the
-- application would have to read the year, add one, and write it back. Two
-- answers arriving together would then both read the same year and both write
-- the same successor, and a student who pressed twice would advance once. Worse,
-- a stale read from an open tab could move them backwards.
--
-- Doing the arithmetic in the statement means the database reads and writes the
-- row it is already holding.
--
-- SECURITY INVOKER, deliberately: this must run as the student, so the existing
-- RLS policy on profiles is what decides whose row may be touched. The `auth.uid()`
-- filter is belt to that braces, and the reason there is no parameter — a
-- function that took a profile id would be a function that could be asked to
-- promote somebody else.
create or replace function public.rpc_advance_academic_year()
returns smallint
language sql
security invoker
set search_path = ''
as $$
  update public.profiles
  set year_of_study = year_of_study + 1
  where id = auth.uid()
    and year_of_study is not null
    -- The ceiling from profiles_year_of_study_check. Expressed here as a filter
    -- rather than left to the constraint so a student at the top gets no row
    -- back instead of a failed transaction.
    and year_of_study < 8
  returning year_of_study;
$$;

comment on function public.rpc_advance_academic_year is
  'Moves the caller up one year of study, atomically, and returns the new year. Returns no row when the year is unset or already at the maximum, so the caller can tell "nothing to do" from "it worked".';

revoke execute on function public.rpc_advance_academic_year() from public;
grant execute on function public.rpc_advance_academic_year() to authenticated;
