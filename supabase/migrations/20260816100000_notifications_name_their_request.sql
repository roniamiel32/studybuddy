-- =============================================================================
-- File:        supabase/migrations/20260816100000_notifications_name_their_request.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: A join-request notification says WHICH request it is about.
--
--              THE FEED HAS BEEN GUESSING. It paired a group_request
--              notification to a live request on (actor, group), because that
--              was the only handle the row carried — and while a student could
--              hold one request per group ever, the pair identified exactly one
--              thing. Preserving history broke that: somebody who joined, left
--              and asked again has several notifications answering to the same
--              (actor, group), so every one of them matched the single live
--              request and every one drew a Review button. Days-old, already
--              decided requests rendered as actionable.
--
--              THE PREVIOUS ATTEMPT AT THIS WAS ALSO A GUESS, and worse: the
--              feed deduplicated on the same pair and kept only the newest, so
--              the admin's view of a person's history vanished as soon as they
--              reapplied. Both bugs have one cause — inferring identity from
--              attributes that were never unique. This adds the identity.
--
--              THE SHAPE IS ALREADY IN THE TABLE: meeting_id, wall_post_id and
--              comment_id are each a typed FK naming the row a notification is
--              about. group_request_id is the fourth of those, not a new idea.
--
--              ORDER MATTERS IN THIS FILE. The backfill has to run before the
--              column joins freeze_notification's guarded set, or the guard
--              refuses the very UPDATE that populates it.
-- Version:     0.36.0
--
-- Modifications:
--     0.36.0 - 2026-08-16 - Initial implementation (Phase 10E)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The column
-- -----------------------------------------------------------------------------

alter table notifications
  add column if not exists group_request_id uuid references group_requests (id) on delete cascade;

comment on column notifications.group_request_id is
  'The join request this notification announces. Lets the feed tell the live request from the finished ones without inferring it from (actor, group), which stopped being unique the moment request history was preserved.';

-- The feed reads "is this notification's request the one still pending", which
-- is a lookup by request id across the caller's notifications.
create index if not exists notifications_group_request_idx
  on notifications (group_request_id)
  where group_request_id is not null;

-- -----------------------------------------------------------------------------
-- 2. Backfill, before the freeze covers the column
-- -----------------------------------------------------------------------------

/*
 * BEST EFFORT, AND ONLY FOR ROWS WRITTEN BEFORE THIS MIGRATION. The trigger runs
 * AFTER INSERT in the request's own transaction, so a notification's created_at
 * is the same instant as its request's or a hair later. Pairing each notification
 * with the newest request that is not newer than it reconstructs the link
 * exactly wherever the two are ordered — and where a row is too old or too
 * ambiguous to match, group_request_id stays null and the feed treats it as
 * history, which is the safe direction to be wrong in.
 */
update notifications n
set group_request_id = (
  /* Correlated rather than a lateral join: UPDATE ... FROM cannot see the
     target table from inside a LATERAL, and the subquery reads the same way. */
  select gr.id
  from public.group_requests gr
  where gr.group_id = n.group_id
    and gr.requester_id = n.actor_id
    and gr.created_at <= n.created_at
  order by gr.created_at desc
  limit 1
)
where n.type = 'group_request'
  and n.group_request_id is null
  and n.group_id is not null
  and n.actor_id is not null;

-- -----------------------------------------------------------------------------
-- 3. Every new one carries it
-- -----------------------------------------------------------------------------

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

  insert into public.notifications (recipient_id, type, actor_id, group_id, group_request_id)
  select m.profile_id, 'group_request', new.requester_id, new.group_id, new.id
  from public.study_group_members m
  where m.group_id = new.group_id
    and m.role = 'admin'
    and m.profile_id <> new.requester_id;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. And cannot be moved to another request afterwards
-- -----------------------------------------------------------------------------

create or replace function public.freeze_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('role', true) is distinct from 'service_role' then
    if new.recipient_id is distinct from old.recipient_id
       or new.type is distinct from old.type
       or new.group_id is distinct from old.group_id
       or new.meeting_id is distinct from old.meeting_id
       -- Joined the guarded set here: which request a notification announces is
       -- the fact the Review button is drawn from, so it must not be editable.
       or new.group_request_id is distinct from old.group_request_id
       or new.occurred_on is distinct from old.occurred_on
       or new.created_at is distinct from old.created_at then
      raise exception 'A notification cannot be rewritten, only marked read.'
        using errcode = '42501';
    end if;

    if (new.actor_id is distinct from old.actor_id and new.actor_id is not null)
       or (new.secondary_id is distinct from old.secondary_id and new.secondary_id is not null) then
      raise exception 'A notification cannot be reassigned to someone else.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;
