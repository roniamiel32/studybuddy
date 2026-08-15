-- =============================================================================
-- File:        supabase/migrations/20260815180000_clear_existing_ghost_attendees.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: The ghosts that were already there.
--
--              THE TRIGGER ONLY LOOKS FORWARD. `withdraw_from_group_meetings`
--              fires when a membership ends, so it cleans up every departure
--              from the moment it was created — and nothing before it. Anyone
--              who left or was removed earlier is still sitting on their old
--              group's upcoming sessions, which is what "2 others coming" in a
--              group of two was reporting.
--
--              THE SAME BOUNDARY AS THE TRIGGER, and for the same reason:
--              `starts_at > now()`. A session that has already run is a record
--              of who was there, and the Phase 7D rating rule reads it. Tidying
--              a count must never reach back and delete the evidence that two
--              people studied together — a backfill is exactly where that
--              mistake gets made, because "clean up all the stale rows" sounds
--              like it should include the old ones.
--
--              MATCHED ON CURRENT MEMBERSHIP, not on any record of leaving.
--              There is no departure log to consult — a membership ending is a
--              deleted row — so the condition is "is an attendee of a group
--              session while not being in that group", which is the state that
--              is wrong regardless of how it came about.
--
--              IDEMPOTENT: re-running deletes nothing, because the first pass
--              leaves no row matching the predicate.
-- Version:     0.34.0
--
-- Modifications:
--     0.34.0 - 2026-08-15 - One-off backfill (Phase 10C)
-- =============================================================================

delete from public.meeting_attendees a
using public.meetings m
where a.meeting_id = m.id
  and m.group_id is not null
  and m.status = 'scheduled'
  /* Future only. Never the sessions that already happened. */
  and m.starts_at > now()
  and not exists (
    select 1
    from public.study_group_members sm
    where sm.group_id = m.group_id
      and sm.profile_id = a.profile_id
  );
