-- =============================================================================
-- File:        supabase/migrations/20260901170000_series_bound_matches_meetings.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: meeting_series may hold a session as long as meetings may.
--
--              A TRANSCRIPTION BUG, AND IT SHIPPED. meeting_series was written
--              by copying the shape of meetings — including its duration bound,
--              which read "8 hours" in the migration that first created the
--              table. It has not said that since 20260816140000: full-day
--              sessions raised the real constraint to twenty-four hours, and the
--              copy was taken from the original text rather than from the
--              database.
--
--              WHAT IT COST. The grid offers 08:00 to 22:00 and merges
--              contiguous picks into one session, so a long Saturday is an
--              ordinary thing to book. Booked as a one-off it went in; booked
--              with "repeat weekly" ticked, the same times were refused by a
--              check constraint, and the student was told "we could not book
--              that session. Try again." — advice that could never work, for a
--              reason nothing on the screen could name.
--
--              THE SHAPE OF THE MISTAKE IS THE LESSON. Two tables that must
--              agree about a rule, with the rule written out twice. This
--              migration makes them agree again; what stops them drifting a
--              second time is the integration test that books a ten-hour series,
--              which fails the moment either bound moves without the other.
-- Version:     0.53.1
--
-- Modifications:
--     0.53.1 - 2026-09-01 - Raise meeting_series_bounded to 24 hours
-- =============================================================================

alter table meeting_series
  drop constraint if exists meeting_series_bounded;

alter table meeting_series
  add constraint meeting_series_bounded
  check (ends_at <= starts_at + interval '24 hours');

comment on constraint meeting_series_bounded on meeting_series is
  'A repeating session cannot run longer than a day, matching meetings_bounded exactly. Both are guards against a mistyped date rather than rules about how long people may study, and a series that allowed less than its own occurrences would refuse bookings the one-off path accepts.';
