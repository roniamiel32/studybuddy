-- =============================================================================
-- File:        supabase/migrations/20260814100000_dismissed_meetings.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Putting away the banner for a session that is over — for yourself,
--              and not for anybody else.
--
--              THE THIRD SIBLING OF hidden_threads AND hidden_messages, at the
--              grain of a meeting. Same shape for the same reason: a row per
--              (person, thing) rather than a flag on the thing means one
--              student's tidying is not something this feature can reach the
--              other participants with, even by accident. They keep the banner
--              until they put it away themselves.
--
--              THE TIME RULE IS A POLICY, NOT A RENDER CONDITION. The UI only
--              draws the X once ends_at has passed, but the UI is a suggestion:
--              a student with the network tab open can call the action on a
--              session that is still ahead of them. `ends_at <= now()` therefore
--              lives in the INSERT policy, where it is the database's answer
--              rather than the component's. Dismissing a session you have not
--              been to yet would hide the only reminder that you agreed to go.
--
--              NO UPDATE GRANT, and no timestamp that anything compares against.
--              Unlike hidden_threads — where a new message legitimately brings a
--              conversation back — a finished meeting has no later event that
--              could make its banner relevant again. It cannot be rescheduled
--              (that books a new row) and it cannot be un-finished. Presence of
--              the row is the whole answer. `dismissed_at` is kept for the same
--              reason hidden_messages keeps one: so a support question about a
--              missing banner has a date to look at.
--
--              THE MEETING ITSELF IS UNTOUCHED. No status change, no delete, no
--              notification write. Dismissing is a statement about one person's
--              chat header, and the attendance record that Phase 7D's rating
--              rule reads has to survive it intact.
-- Version:     0.29.0
--
-- Modifications:
--     0.29.0 - 2026-08-14 - Initial implementation (Phase 9G)
-- =============================================================================

create table dismissed_meetings (
  profile_id   uuid not null references profiles (id) on delete cascade,
  meeting_id   uuid not null references meetings (id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  -- One row per person per meeting; dismissing twice is dismissing once.
  primary key (profile_id, meeting_id)
);

comment on table dismissed_meetings is
  'Finished sessions a student has cleared from their own chat banner. One row per person per meeting, so the other attendees keep the banner until they dismiss it themselves. Never affects the meeting, its status, or the attendance record the rating rule reads.';

-- The chat header reads "the meetings in this thread, minus the ones I have put
-- away", which is an anti-join on (profile_id, meeting_id) — served by the
-- primary key. This index is the other direction: cascade cleanup when a
-- profile is deleted, which would otherwise seq-scan the table.
create index dismissed_meetings_profile_idx on dismissed_meetings (profile_id);

grant all privileges on public.dismissed_meetings to service_role;
-- No UPDATE: there is nothing on the row to change. Undismissing is a delete.
grant select, insert, delete on public.dismissed_meetings to authenticated;

alter table dismissed_meetings enable row level security;

-- Every policy is `profile_id = auth.uid()`, SELECT included. Which banners
-- somebody has cleared is between them and their own screen, and no part of the
-- product needs to ask.
create policy "you see only your own dismissed meetings"
  on public.dismissed_meetings for select to authenticated
  using (profile_id = auth.uid());

-- Two conditions, both load-bearing.
--
-- app_is_meeting_attendee: without it the table accepts a row for any meeting
-- id, which turns it into a way of confirming that a given id exists — the same
-- hole the hidden_messages insert policy closes.
--
-- ends_at <= now(): the time restriction itself, stated where it cannot be
-- skipped by calling the action directly.
create policy "you can dismiss a finished meeting you were invited to"
  on public.dismissed_meetings for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.meetings m
      where m.id = meeting_id
        and m.ends_at <= now()
        and public.app_is_meeting_attendee(m.id)
    )
  );

-- Deleting is unconditional beyond ownership: bringing your own banner back is
-- never something to stop, and the time check above has already done its work.
create policy "you can bring back your own dismissed meeting"
  on public.dismissed_meetings for delete to authenticated
  using (profile_id = auth.uid());
