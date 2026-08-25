-- =============================================================================
-- File:        supabase/migrations/20260815210000_new_members_join_upcoming_sessions.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Joining a group joins you to what the group has already planned.
--
--              THE MIRROR OF withdraw_from_group_meetings. Leaving takes you off
--              the group's upcoming sessions; joining should put you on them, and
--              until now only the first half existed. A student approved on the
--              15th could not see a session booked on the 12th for the 19th — no
--              card, no RSVP buttons — while the hour was already unbookable in
--              their scheduler, because rpc_meeting_slots subtracts what the
--              OTHER members are committed to. Invisible and unavailable at once,
--              which is the worst pair.
--
--              THERE IS NO 'PENDING' RSVP, AND THAT IS DELIBERATE — the enum is
--              ('going','cancelled') and the schema says why: "there is no maybe,
--              the timeslot is either blocked in your week or it is not". The
--              pending state this needs already exists and is spelled
--              `rsvp = 'going'` with `responded_at is null` — invited, presumed
--              coming, has not actually answered. It is exactly what
--              rpc_create_meeting writes for everyone except the organiser, so a
--              new member arrives on the same footing as somebody who was in the
--              group when the session was booked.
--
--              FUTURE SESSIONS ONLY, and never the chat. Being added to a session
--              that has already run would invent attendance — the record the
--              Phase 7D rating rule reads — for somebody who was not in the group
--              at the time. `starts_at > now()` is the same boundary the
--              withdrawal trigger uses. The group's earlier MESSAGES stay hidden
--              regardless: getGroupMessages filters on the membership row's
--              joined_at, which this does not touch.
--
--              A CLASH CANNOT BREAK THE JOIN. check_meeting_no_clash refuses an
--              attendee row that collides with something they are already going
--              to, so a plain INSERT would abort the whole approval for a student
--              who happens to be busy. The loop below skips those rows instead:
--              missing one session is a smaller failure than not being let into
--              the group, and the session is still visible to them the moment
--              they free the slot up.
-- Version:     0.35.0
--
-- Modifications:
--     0.35.0 - 2026-08-15 - Initial implementation (Phase 10D)
-- =============================================================================

create or replace function public.join_upcoming_group_meetings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meeting_id uuid;
begin
  for v_meeting_id in
    select m.id
    from public.meetings m
    where m.group_id = new.group_id
      and m.status = 'scheduled'
      and m.starts_at > now()
      /* Re-joining a group they had been on a session for already. */
      and not exists (
        select 1
        from public.meeting_attendees a
        where a.meeting_id = m.id
          and a.profile_id = new.profile_id
      )
    order by m.starts_at
  loop
    begin
      insert into public.meeting_attendees (meeting_id, profile_id, rsvp, responded_at)
      values (v_meeting_id, new.profile_id, 'going', null);
    exception
      when others then
        /*
         * Almost always the clash trigger. Swallowed per session rather than per
         * join, so one busy afternoon costs them that session and nothing else.
         */
        null;
    end;
  end loop;

  return new;
end;
$$;

comment on function public.join_upcoming_group_meetings is
  'Adds a new group member to the group''s upcoming sessions as going/unanswered, so a session booked before they joined is visible and answerable. Never touches sessions that have started, and never the group''s message history.';

drop trigger if exists study_group_members_join_meetings on public.study_group_members;

create trigger study_group_members_join_meetings
  after insert on public.study_group_members
  for each row
  execute function public.join_upcoming_group_meetings();
