-- =============================================================================
-- File:        supabase/migrations/20260815140000_rejoining_and_ghost_attendees.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Two things that leaving a group failed to undo.
--
--              1. THE DOOR LOCKED BEHIND THEM. A student who was removed from a
--              group — or who left — could not ask to come back. Their old row
--              was still `approved`, and the live-request index covered both
--              'pending' and 'approved', so a fresh request collided with a
--              membership that had already ended.
--
--              THE INDEX WAS CARRYING TWO RULES AND ONLY OWNS ONE. "One live
--              request at a time" is its job. "A member cannot ask to join a
--              group they are already in" is not, and never was — that is the
--              INSERT policy's `not app_is_group_member(group_id)`, which reads
--              current membership rather than an old decision about it. Once
--              membership ends the policy correctly steps aside; the index did
--              not, because an approved row is frozen at approved forever. So
--              this narrows the index to 'pending' and leaves the membership
--              question where it was already answered properly.
--
--              History is untouched by this. The old approved row stays exactly
--              where it is — it is the record that they were once in the group,
--              and the second membership gets its own row when it happens. Two
--              approved rows for one pair is now possible and is the honest
--              description of somebody who joined, left, and joined again.
--
--              2. GHOSTS AT THE TABLE. Leaving a group did not withdraw the
--              leaver from its upcoming sessions, so a group of two showed "2
--              others coming" — the count read meeting_attendees, which still
--              had a third row marked going. Reproduced before fixing: two
--              members, three going.
--
--              THE ROW IS DELETED, NOT CANCELLED, and that is a deliberate
--              departure from "an rsvp is cancelled and never deleted". That
--              rule protects the record of a session that HAPPENED: who was
--              there, who dropped out, and therefore who may rate whom. A
--              session three days from now has no such record to protect, and
--              'cancelled' would say something untrue — it means "I decided not
--              to come", where this is "you are no longer invited". Withdrawing
--              an invitation is not declining one.
--
--              ONLY FUTURE SESSIONS ARE TOUCHED, which is the load-bearing half.
--              Reaching back into a meeting that has already started would erase
--              the attendance the Phase 7D rating rule reads, letting somebody
--              destroy evidence of a session they sat through by leaving the
--              group afterwards. `starts_at > now()` is what stops that.
-- Version:     0.33.0
--
-- Modifications:
--     0.33.0 - 2026-08-15 - Initial implementation (Phase 10B)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. One LIVE request, not one request ever
-- -----------------------------------------------------------------------------

drop index if exists public.group_requests_one_live_per_student_idx;

create unique index group_requests_one_live_per_student_idx
  on public.group_requests (group_id, requester_id)
  where status = 'pending';

comment on index public.group_requests_one_live_per_student_idx is
  'One outstanding request per student per group. Deliberately does NOT cover approved rows: a membership that has ended must not block asking to come back, and "you are already a member" is enforced by the INSERT policy against current membership instead.';

-- -----------------------------------------------------------------------------
-- 2. Leaving a group withdraws you from its upcoming sessions
-- -----------------------------------------------------------------------------

create or replace function public.withdraw_from_group_meetings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  /*
   * A TRIGGER RATHER THAN TWO SERVER ACTIONS. Leaving and being removed are the
   * same DELETE, and so are the paths nobody thinks about — an admin clearing
   * out an empty group, a cascade from the group or the profile. One rule at the
   * point the membership actually ends covers all of them, and cannot be
   * forgotten by the next thing that deletes a member.
   *
   * Runs during profile-deletion cascades too, where meetings may already be
   * half gone. That is safe: a delete matching nothing is not an error, which is
   * the whole reason this is a DELETE and not an UPDATE. An UPDATE here would
   * meet the attendance freeze and turn a routine account deletion into a
   * failure — the same shape of trap that check_meeting_consistency hit.
   */
  delete from public.meeting_attendees a
  using public.meetings m
  where a.meeting_id = m.id
    and a.profile_id = old.profile_id
    and m.group_id = old.group_id
    and m.status = 'scheduled'
    /* Future only. A session already under way is a record, not a plan. */
    and m.starts_at > now();

  return old;
end;
$$;

comment on function public.withdraw_from_group_meetings is
  'Removes a departing member from the group''s upcoming sessions, so attendee counts describe people who are still in the group. Never touches a session that has started — that attendance is what the rating rule reads.';

/* Dropped first so the whole file can be re-run against a database that already
   has it — the function above is `or replace`, and a trigger that is not would
   make this migration the one step that cannot be repeated. */
drop trigger if exists study_group_members_withdraw_meetings on public.study_group_members;

create trigger study_group_members_withdraw_meetings
  after delete on public.study_group_members
  for each row
  execute function public.withdraw_from_group_meetings();
