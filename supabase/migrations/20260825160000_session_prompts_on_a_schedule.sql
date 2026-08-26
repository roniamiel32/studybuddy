-- =============================================================================
-- File:        supabase/migrations/20260825160000_session_prompts_on_a_schedule.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: The end-of-session prompt stops depending on somebody opening the
--              notifications page.
--
--              WHAT WAS ACTUALLY WRONG, because it was not what it looked like.
--              There is no background task anywhere in this application: every
--              setTimeout in the codebase lives in a 'use client' module and
--              runs in the browser. Vercel was never killing anything, because
--              nothing was ever scheduled server-side.
--
--              The real gap is that rpc_sync_notifications is called from
--              exactly one place — getMyNotifications, which runs when a student
--              opens /notifications — and it derives its work from auth.uid(),
--              so it can only ever sync for whoever is asking. The rate_partner
--              prompt that says "your session has ended, say how it went" was
--              therefore created only if the student went looking for it, and
--              the bell could never light up to tell them, because
--              getUnreadNotificationCount deliberately does not sync. In
--              development you navigate constantly and it feels like it works.
--              In production a student who does not visit that page never gets
--              the notification at all.
--
--              WHY ONLY THE SESSION PROMPTS ARE SCHEDULED. rpc_sync_notifications
--              also materialises birthdays, new matches and mutual-connection
--              suggestions, and two of those call rpc_find_candidates — the most
--              expensive query in the product. Running the whole thing for every
--              profile on a timer would multiply that by the size of the cohort,
--              every quarter of an hour, to refresh things nobody is waiting on.
--              The session prompt is the one that is genuinely time-triggered:
--              it becomes true at a known instant with no user action behind it,
--              which is exactly what a schedule is for. Everything else stays on
--              the visit, where its cost is paid by the person who wants it.
--
--              IDEMPOTENT BY INDEX, not by bookkeeping. The insert conflicts
--              against notifications_rate_partner_once_idx — unique on
--              (recipient_id, meeting_id, actor_id) where type = 'rate_partner'
--              — so a run that overlaps the previous one, or a student who also
--              opens the page, writes nothing twice. That is what makes it safe
--              to run on a short interval and safe to run by hand.
--
--              BOUNDED TO THE RECENT PAST. Without the window this would rescan
--              every meeting ever held on every run, to insert rows the index
--              would reject anyway. Fourteen days is comfortably longer than
--              anyone takes to answer a rating prompt.
-- Version:     1.0.2
--
-- Modifications:
--     1.0.2 - 2026-08-25 - Session prompts materialised on a schedule
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The prompt, for everybody, with no caller
-- -----------------------------------------------------------------------------

create or replace function public.sync_session_prompts(p_within interval default interval '14 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_written integer;
begin
  /*
   * The same rule rpc_sync_notifications applies to the caller, applied to every
   * attendee instead: you are prompted to rate the people you were still going
   * to a finished session with, and only until you have said something about
   * them.
   */
  insert into public.notifications (recipient_id, type, actor_id, meeting_id, occurred_on)
  select
    mine.profile_id,
    'rate_partner',
    theirs.profile_id,
    m.id,
    (m.ends_at at time zone 'UTC')::date
  from public.meeting_attendees mine
  join public.meetings m
    on m.id = mine.meeting_id
  join public.meeting_attendees theirs
    on theirs.meeting_id = mine.meeting_id
   and theirs.profile_id <> mine.profile_id
  where mine.rsvp = 'going'
    and theirs.rsvp = 'going'
    and m.status = 'scheduled'
    and m.ends_at <= now()
    and m.ends_at > now() - p_within
    and not exists (
      select 1
      from public.study_ratings r
      where r.rater_id = mine.profile_id
        and r.ratee_id = theirs.profile_id
    )
  on conflict do nothing;

  get diagnostics v_written = row_count;

  return v_written;
end;
$$;

comment on function public.sync_session_prompts is
  'Creates the "say how it went" prompt for every attendee of a session that has ended, for everyone rather than for one caller. Idempotent against notifications_rate_partner_once_idx, so it is safe to run on a timer and safe to run by hand.';

-- Nobody signs in as this. It is called by the scheduler, and by an operator
-- with the service role; a student's own prompts still arrive through
-- rpc_sync_notifications when they open the page.
revoke execute on function public.sync_session_prompts(interval) from public;
revoke execute on function public.sync_session_prompts(interval) from authenticated;
grant execute on function public.sync_session_prompts(interval) to service_role;

-- -----------------------------------------------------------------------------
-- 2. Run it on a schedule, where the platform can
-- -----------------------------------------------------------------------------

-- GUARDED, because this migration must apply everywhere the others do. pg_cron
-- is available on Supabase and in the local stack, but a plain PostgreSQL a
-- marker or a CI job might run this against will not have it — and the function
-- above is the valuable half. Without the extension it simply goes unscheduled
-- and can be driven by any other timer: a Vercel Cron route, an Upstash job, or
-- a GitHub Action calling it with the service role.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    /* Replace rather than duplicate, so re-running is harmless. */
    perform cron.unschedule('studybuddy-session-prompts')
    where exists (
      select 1 from cron.job where jobname = 'studybuddy-session-prompts'
    );

    /*
     * Every fifteen minutes. The prompt is not urgent — it invites somebody to
     * reflect on a session that has just ended — and a quarter of an hour is
     * well inside the time it takes anyone to pick their phone up. A tighter
     * interval would buy nothing and wake the database four times as often.
     */
    perform cron.schedule(
      'studybuddy-session-prompts',
      '*/15 * * * *',
      $cron$select public.sync_session_prompts();$cron$
    );
  else
    raise notice 'pg_cron unavailable; sync_session_prompts created but not scheduled.';
  end if;
end;
$$;
