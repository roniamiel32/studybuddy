-- =============================================================================
-- File:        supabase/migrations/20260811160000_notifications.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Phase 8A — the notification feed behind the navbar bell.
--
--              TWO KINDS OF NOTIFICATION, and the split decides everything else:
--
--                EVENTS have a row behind them. Someone asked to join a group,
--                someone was promoted, a meeting was booked or called off. These
--                are written by TRIGGERS on the tables where the event happens,
--                so a notification cannot be missed by an application path that
--                forgot to send one, and cannot be forged by a client.
--
--                DERIVED notifications have no event at all. "It is Maya's
--                birthday" and "these two should meet" are facts about a moment,
--                true whether or not anything was written. They are materialised
--                on demand by rpc_sync_notifications, which the feed calls when
--                it opens, and made idempotent by unique indexes rather than by
--                remembering what it did last time.
--
--              WHY NOT pg_cron for the derived ones: it would put a scheduled job
--              in the deployment story for a feature whose whole cost is one
--              query when someone opens a dropdown. On-demand also means a
--              student who never opens the feed never accrues rows.
--
--              WHAT THE CLIENT MAY DO: read its own, and mark them read. There is
--              no INSERT policy at all. Every writer here is a definer function or
--              a trigger, because "you have a new match" is a claim about the
--              system, and a notification a user can write is a notification a
--              user can lie with.
--
--              THE BIRTHDAY RULE. §15.4 promised the birth date never leaves the
--              database. app_connection_birthday returns MONTH AND DAY and never
--              the year, and only to a connection — so a birthday reveals nothing
--              about age that the profile did not already show.
-- Version:     0.20.0
--
-- Modifications:
--     0.20.0 - 2026-08-11 - Initial schema (Phase 8A)
-- =============================================================================

create type notification_type as enum (
  -- Events, written by triggers.
  'group_request',
  'group_promotion',
  'meeting_scheduled',
  'meeting_cancelled',
  -- Derived, materialised on demand.
  'new_match',
  'birthday',
  'match_suggestion'
);

comment on type notification_type is
  'The first four have a row behind them and are written by triggers; the last three are facts about a moment and are materialised by rpc_sync_notifications.';

create table notifications (
  id             uuid primary key default gen_random_uuid(),
  recipient_id   uuid not null references profiles (id) on delete cascade,
  type           notification_type not null,

  -- Who did the thing, or who the thing is about.
  --
  -- CASCADE, unlike the `set null` this schema uses for authorship elsewhere. A
  -- message survives its author because the thread is a shared record; a
  -- notification does not, because "it is someone's birthday" with nobody in it
  -- is not a fact. The constraint below requires most types to name their
  -- subject, so set null would have made deleting an account fail outright.
  actor_id       uuid references profiles (id) on delete cascade,
  -- The second party, for a suggestion — "you two should meet" names two people.
  secondary_id   uuid references profiles (id) on delete cascade,

  group_id       uuid references study_groups (id) on delete cascade,
  meeting_id     uuid references meetings (id) on delete cascade,
  course_offering_id uuid references course_offerings (id) on delete set null,

  -- The day the fact was true, which is what makes a birthday one-per-year
  -- rather than one-per-visit. Dated rather than timestamped on purpose.
  occurred_on    date not null default current_date,

  read_at        timestamptz,
  created_at     timestamptz not null default now(),

  constraint notifications_no_self check (actor_id is null or actor_id <> recipient_id),
  -- Each type carries the reference it is about. Without this a 'birthday' with
  -- no actor renders as "someone has a birthday", which is not a notification.
  constraint notifications_has_its_subject check (
    case type
      when 'group_request'     then group_id is not null and actor_id is not null
      when 'group_promotion'   then group_id is not null
      when 'meeting_scheduled' then meeting_id is not null
      when 'meeting_cancelled' then meeting_id is not null
      when 'new_match'         then actor_id is not null
      when 'birthday'          then actor_id is not null
      when 'match_suggestion'  then actor_id is not null and secondary_id is not null
    end
  )
);

comment on table notifications is
  'One row per thing a student should know about. No INSERT policy: every writer is a trigger or a definer function, because a notification a user can write is a notification a user can lie with.';

comment on column notifications.occurred_on is
  'The day the fact was true. Part of the dedupe keys below, which is what makes a birthday arrive once a year rather than once per page load.';

-- The feed reads "mine, newest first"; the badge counts "mine, unread".
create index notifications_recipient_recent_idx
  on notifications (recipient_id, created_at desc);

create index notifications_unread_idx
  on notifications (recipient_id)
  where read_at is null;

-- ---- The dedupe keys --------------------------------------------------------
--
-- These are what let rpc_sync_notifications run on every feed open and insert
-- nothing the second time. Partial and per-type, because each kind repeats on a
-- different clock: a birthday is once a year, a suggestion is once ever, a match
-- is once per person.

create unique index notifications_birthday_once_a_year_idx
  on notifications (recipient_id, actor_id, occurred_on)
  where type = 'birthday';

create unique index notifications_match_once_per_person_idx
  on notifications (recipient_id, actor_id)
  where type = 'new_match';

-- least/greatest, so suggesting A-to-B and B-to-A is the same suggestion.
create unique index notifications_suggestion_once_per_pair_idx
  on notifications (recipient_id, least(actor_id, secondary_id), greatest(actor_id, secondary_id))
  where type = 'match_suggestion';

-- -----------------------------------------------------------------------------
-- Connections, and what one is
-- -----------------------------------------------------------------------------

-- Whether two students are connected.
--
-- §15.5: connections ARE positive ratings. Since Phase 7D a positive rating
-- requires a finished meeting both attended, so a connection is something two
-- people did together rather than something either of them clicked — which is
-- why this is a safe gate for writing on someone's wall.
--
-- EITHER DIRECTION. Requiring both would mean almost nobody qualifies: rating is
-- optional, and the person who was rated has no prompt to rate back.
create or replace function public.app_is_connection(profile_a uuid, profile_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.study_ratings r
    where r.sentiment = 'positive'
      and (
        (r.rater_id = profile_a and r.ratee_id = profile_b)
        or (r.rater_id = profile_b and r.ratee_id = profile_a)
      )
  );
$$;

comment on function public.app_is_connection is
  'True when either student has rated the other positively. Definer because it reads rows the caller may not select — a negative rating stays invisible, and this never discloses which direction the positive one ran.';

revoke execute on function public.app_is_connection(uuid, uuid) from public;
grant execute on function public.app_is_connection(uuid, uuid) to authenticated;

-- A connection's birthday, as month and day.
--
-- THE YEAR NEVER LEAVES. §15.4 traded the birth date for an age and said so in
-- writing; this returns less than that function does — a date with no year
-- discloses nothing about how old anyone is. Gated on connection, so it is not
-- readable by the whole university.
create or replace function public.app_connection_birthday(target_profile_id uuid)
returns table (birth_month int, birth_day int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    extract(month from pp.date_of_birth)::int,
    extract(day from pp.date_of_birth)::int
  from public.profile_private pp
  where pp.profile_id = target_profile_id
    and pp.date_of_birth is not null
    and public.app_is_connection(auth.uid(), target_profile_id);
$$;

comment on function public.app_connection_birthday is
  'Month and day only, and only for a connection. The year is never returned, so a birthday adds nothing to what app_profile_age_years already discloses.';

revoke execute on function public.app_connection_birthday(uuid) from public;
grant execute on function public.app_connection_birthday(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Grants and RLS
-- -----------------------------------------------------------------------------

grant all privileges on public.notifications to service_role;

-- Read yours, and mark them read. Nothing else: there is deliberately no INSERT
-- and no DELETE for a student. A feed you can write is a feed that can lie to
-- you, and one you can delete from is one where "you were removed from a group"
-- can be made to disappear.
grant select, update on public.notifications to authenticated;

alter table notifications enable row level security;

create policy "you read your own notifications"
  on public.notifications for select to authenticated
  using (recipient_id = auth.uid());

-- Marking read is the only field a student may move. The freeze trigger below is
-- what holds them to it — an UPDATE grant reaches every column.
create policy "you can mark your own notifications read"
  on public.notifications for update to authenticated
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());

-- Read is the only field a student may move.
--
-- Nothing here needs an exception for account deletion, because actor_id and
-- secondary_id CASCADE rather than nulling — the row goes with the person, so
-- this trigger never sees that update. It saw it in the first draft, refused it,
-- and made deleting an account fail; the fix belonged on the foreign key.
create or replace function public.freeze_notification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('role', true) is distinct from 'service_role' then
    if new.recipient_id is distinct from old.recipient_id
       or new.type is distinct from old.type
       or new.group_id is distinct from old.group_id
       or new.meeting_id is distinct from old.meeting_id
       or new.occurred_on is distinct from old.occurred_on
       or new.created_at is distinct from old.created_at then
      raise exception 'A notification cannot be rewritten, only marked read.'
        using errcode = '42501';
    end if;

    if new.actor_id is distinct from old.actor_id
       or new.secondary_id is distinct from old.secondary_id then
      raise exception 'A notification cannot be reassigned to someone else.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger notifications_freeze
  before update on public.notifications
  for each row execute function public.freeze_notification();

-- The bell updates without a refresh, like the message badge already does.
alter publication supabase_realtime add table public.notifications;

-- -----------------------------------------------------------------------------
-- The events
-- -----------------------------------------------------------------------------

-- Someone asked to join a group: tell every admin of it.
--
-- EVERY admin, because Phase 7A made the decision shared and the request already
-- shows in all their lists. An invitation is skipped — it is addressed to one
-- student, and they see it in their own inbox rather than as an alert.
create or replace function public.notify_group_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind <> 'request' or new.status <> 'pending' then
    return new;
  end if;

  insert into public.notifications (recipient_id, type, actor_id, group_id)
  select m.profile_id, 'group_request', new.requester_id, new.group_id
  from public.study_group_members m
  where m.group_id = new.group_id
    and m.role = 'admin'
    and m.profile_id <> new.requester_id;

  return new;
end;
$$;

create trigger group_requests_notify
  after insert on public.group_requests
  for each row execute function public.notify_group_request();

-- A member became an admin.
create or replace function public.notify_group_promotion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'member' and new.role = 'admin' then
    insert into public.notifications (recipient_id, type, actor_id, group_id)
    values (new.profile_id, 'group_promotion', nullif(auth.uid(), new.profile_id), new.group_id);
  end if;

  return new;
end;
$$;

create trigger study_group_members_notify_promotion
  after update on public.study_group_members
  for each row execute function public.notify_group_promotion();

-- A session was booked: tell everyone on it except whoever booked it.
create or replace function public.notify_meeting_scheduled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_by uuid;
begin
  select m.created_by into v_created_by
  from public.meetings m
  where m.id = new.meeting_id;

  if new.profile_id is distinct from v_created_by then
    insert into public.notifications (recipient_id, type, actor_id, meeting_id)
    values (new.profile_id, 'meeting_scheduled', v_created_by, new.meeting_id);
  end if;

  return new;
end;
$$;

create trigger meeting_attendees_notify_scheduled
  after insert on public.meeting_attendees
  for each row execute function public.notify_meeting_scheduled();

-- A session was called off: tell everyone who was still going.
create or replace function public.notify_meeting_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'scheduled' and new.status = 'cancelled' then
    insert into public.notifications (recipient_id, type, actor_id, meeting_id)
    select a.profile_id, 'meeting_cancelled', new.cancelled_by, new.id
    from public.meeting_attendees a
    where a.meeting_id = new.id
      and a.rsvp = 'going'
      and a.profile_id is distinct from new.cancelled_by;
  end if;

  return new;
end;
$$;

create trigger meetings_notify_cancelled
  after update on public.meetings
  for each row execute function public.notify_meeting_cancelled();
