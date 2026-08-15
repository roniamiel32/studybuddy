-- =============================================================================
-- File:        supabase/migrations/20260816160000_notify_on_join_approved.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Telling a student their request to join was accepted.
--
--              THE APPLICATION HAS BEEN TRYING TO SEND THIS AND FAILING. Two
--              server actions inserted into `notifications` directly; both were
--              refused, because `authenticated` has neither an INSERT grant nor
--              an INSERT policy on that table. One swallowed the error and the
--              other logged it, so the student was simply never told they were
--              in. That is not an oversight in the permissions — it is the rule
--              this schema is built on: a feed the client can write to is a feed
--              that can lie, so every row in it comes from a trigger fired by the
--              event it describes. This is that trigger.
--
--              IT FIRES ON MEMBERSHIP, NOT ON THE DECISION, because membership is
--              the thing the student cares about and the thing that is definitely
--              true by the time it exists. rpc_approve_group_request marks the
--              request approved and inserts the member in one transaction; a
--              trigger on the request would announce a membership the capacity
--              check could still refuse.
--
--              THREE WAYS INTO study_group_members, AND ONLY ONE IS THIS EVENT:
--                - a founder, added by add_group_admin_as_member when they create
--                  the group. No request exists, so nothing is sent.
--                - a student whose request an admin approved. This is the one.
--                - a student accepting an invitation, where the decision is their
--                  own. Telling somebody their own click was approved is noise,
--                  so decided_by = the new member is skipped.
--              Reading the approved request rather than inspecting the role is
--              what makes those three separable — the founder has no request
--              behind them, and an accepted invite names the invitee as decider.
-- Version:     0.38.0
--
-- Modifications:
--     0.38.0 - 2026-08-16 - Initial implementation (Phase 10F)
-- =============================================================================

--              THE TYPE ITSELF IS ADDED BY THE MIGRATION BEFORE THIS ONE.
--              PostgreSQL will not let a new enum value be used in the
--              transaction that created it, and the CHECK below uses it.
-- -----------------------------------------------------------------------------
-- 1. Declaring what it is about
-- -----------------------------------------------------------------------------

/*
 * notifications_has_its_subject ends in `ELSE false`, so a type that does not
 * say which columns identify its subject cannot be inserted at all. That is the
 * table refusing to hold a row nothing can render — and it caught this one on
 * the first run, before any of it reached a screen. A join approval is about a
 * group and the admin who accepted it, which is the same pair group_invite
 * declares.
 */
alter table notifications
  drop constraint notifications_has_its_subject;

alter table notifications
  add constraint notifications_has_its_subject
  check (
    case type
      when 'group_request'      then group_id is not null and actor_id is not null
      when 'group_promotion'    then group_id is not null
      when 'group_invite'       then group_id is not null and actor_id is not null
      when 'group_join_approved' then group_id is not null and actor_id is not null
      when 'meeting_scheduled'  then meeting_id is not null
      when 'meeting_cancelled'  then meeting_id is not null
      when 'rate_partner'       then meeting_id is not null and actor_id is not null
      when 'new_match'          then actor_id is not null
      when 'birthday'           then actor_id is not null
      when 'match_suggestion'   then actor_id is not null and secondary_id is not null
      when 'wall_post'          then wall_post_id is not null and actor_id is not null
      when 'post_like'          then wall_post_id is not null and actor_id is not null
      when 'post_comment'       then wall_post_id is not null and actor_id is not null
      when 'post_share'         then wall_post_id is not null and actor_id is not null
      when 'comment_reply'      then comment_id is not null and actor_id is not null
      when 'comment_like'       then comment_id is not null and actor_id is not null
      else false
    end
  );

-- -----------------------------------------------------------------------------
-- 2. The trigger
-- -----------------------------------------------------------------------------

create or replace function public.notify_group_join_approved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id  uuid;
  v_decided_by  uuid;
begin
  /*
   * The request this membership came from. Newest first, because somebody who
   * joined, left and was approved again has more than one — and it is the
   * current one this notification is about.
   */
  select r.id, r.decided_by
  into v_request_id, v_decided_by
  from public.group_requests r
  where r.group_id = new.group_id
    and r.requester_id = new.profile_id
    and r.status = 'approved'
  order by r.decided_at desc nulls last, r.created_at desc
  limit 1;

  /* A founder, or any other path with no request behind it. */
  if v_request_id is null then
    return new;
  end if;

  /* An invitation they accepted themselves. They know. */
  if v_decided_by is null or v_decided_by = new.profile_id then
    return new;
  end if;

  insert into public.notifications
    (recipient_id, type, actor_id, group_id, group_request_id)
  values
    (new.profile_id, 'group_join_approved', v_decided_by, new.group_id, v_request_id);

  return new;
end;
$$;

comment on function public.notify_group_join_approved is
  'Tells a student their join request was accepted, when the membership row that proves it appears. Silent for founders (no request behind them) and for invitations somebody accepted for themselves.';

drop trigger if exists study_group_members_notify_approved on public.study_group_members;

create trigger study_group_members_notify_approved
  after insert on public.study_group_members
  for each row
  execute function public.notify_group_join_approved();
