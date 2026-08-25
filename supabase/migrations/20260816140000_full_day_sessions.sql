-- =============================================================================
-- File:        supabase/migrations/20260816140000_full_day_sessions.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: A study session may now run a whole day.
--
--              THE OLD BOUND WAS EIGHT HOURS, and its comment said what it was
--              for: "a guard against a typo in a date field, not a product
--              opinion about how long people may work". That reasoning still
--              holds — it is the number that was wrong, not the idea. Before
--              exams people book the library from morning to closing, and the
--              picker offers blocks from 08:00 to 22:00, so a fourteen-hour
--              selection is an ordinary thing to want and the constraint was
--              refusing it.
--
--              TWENTY-FOUR RATHER THAN NO BOUND AT ALL. Dropping the check
--              entirely would let a mistyped year book a session lasting until
--              2027 — silently, and then subtract those months from everybody's
--              availability, because rpc_meeting_slots derives "busy" from
--              meetings people are going to. One bad row would make the pair
--              unbookable forever with nothing on screen to explain it. A day is
--              past anything a student will legitimately ask for and still
--              catches that.
--
--              THE FRONTEND CAP GOES WITH IT. mergeSelectedSlots split a
--              contiguous run at eight hours so the picker never built a booking
--              this constraint would refuse; with the constraint moved, the split
--              would be the only thing standing between a student and the full
--              day they selected.
-- Version:     0.38.0
--
-- Modifications:
--     0.38.0 - 2026-08-16 - Eight hours becomes twenty-four (Phase 10F)
-- =============================================================================

alter table meetings
  drop constraint if exists meetings_bounded;

alter table meetings
  add constraint meetings_bounded
  check (ends_at <= starts_at + interval '24 hours');

comment on constraint meetings_bounded on meetings is
  'A session cannot run longer than a day. Still a guard against a mistyped date rather than a rule about how long people may study — an unbounded session would quietly remove months from every attendee''s availability, since busy time is derived from the meetings they are going to.';
