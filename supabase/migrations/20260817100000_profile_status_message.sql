-- =============================================================================
-- File:        supabase/migrations/20260817100000_profile_status_message.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: A line a student can put above their face — "בתקופת מבחנים",
--              "נא לא להפריע" — the way WhatsApp shows an About.
--
--              IT DOES NOT EXPIRE, and that is the whole design. There is no
--              `status_expires_at` and no sweeper: a status stays until its owner
--              changes or clears it. Anything self-clearing would need a job to
--              clear it, a rule for what "stale" means, and an answer for the
--              student who set "בתקופת מבחנים" three weeks before the exam —
--              none of which anyone asked for. Clearing is a button.
--
--              A PLAIN NULLABLE COLUMN ON profiles, not a table of its own. One
--              row per student, read on every profile render and on nothing else,
--              with no history worth keeping — the join would cost more than the
--              column and buy nothing. It sits beside city and year_of_study,
--              which are the same shape of fact.
--
--              NO NEW POLICY IS NEEDED, and it is worth saying why rather than
--              leaving it to be discovered. `you can update only your own
--              profile` is `id = auth.uid()` with no column list, so the owner
--              can already write this and nobody else can. Reading follows the
--              existing profile visibility, which is what a status is for: it is
--              addressed to whoever can already see the profile.
--
--              THE LENGTH BOUND IS 80. Long enough for any of the presets and a
--              sentence of their own, short enough to sit on one line above an
--              avatar without the bubble growing into a paragraph. Trimmed and
--              nullified when empty by the action, so "  " never becomes a status
--              that renders as an empty bubble.
-- Version:     0.39.0
--
-- Modifications:
--     0.39.0 - 2026-08-17 - Initial implementation (Phase 11A)
-- =============================================================================

alter table profiles
  add column if not exists status_message text
  check (char_length(btrim(status_message)) between 1 and 80);

comment on column profiles.status_message is
  'A short line the student sets about themselves, shown as a bubble above their avatar. Never expires and is never set by anything but its owner — null means they have none.';
