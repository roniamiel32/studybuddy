-- =============================================================================
-- File:        supabase/migrations/20260813180000_group_read_state.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Group chat learns who has read what.
--
--              A TIMESTAMP PER MEMBER, NOT A FLAG PER MESSAGE. Direct messages
--              carry `is_read` because there are two people and a read receipt
--              is shown to the sender. A group has many readers and shows no
--              receipts, so a per-message flag would need a row per member per
--              message to say anything true. One `last_seen_at` on the
--              membership answers the only question the badge asks — "how much
--              of this arrived after I last looked?" — with one column.
--
--              WHY A FUNCTION AND NOT AN RLS POLICY. `study_group_members` has
--              exactly one UPDATE policy and it is admin-only, which is what
--              keeps a member from editing their own row. Adding "a member may
--              update their own membership" so they could stamp last_seen_at
--              would also let them set `role = 'admin'` on themselves —
--              check_group_role_change restricts DEMOTION, not promotion, so RLS
--              is the only thing standing in the way. A SECURITY DEFINER
--              function that writes one column for auth.uid() gives the member
--              the one power they need and none of the others.
--
--              THE UPDATE TRIGGERS ARE SAFE, and that was checked rather than
--              assumed — this table carries three. check_group_role_change
--              returns early when the role is unchanged, notify_group_promotion
--              only fires on member→admin, and ensure_group_keeps_an_admin only
--              on admin→not-admin. A last_seen_at touch trips none of them.
-- Version:     0.27.0
--
-- Modifications:
--     0.27.0 - 2026-08-13 - Initial implementation (Phase 9E)
-- =============================================================================

alter table study_group_members
  add column last_seen_at timestamptz not null default now();

comment on column study_group_members.last_seen_at is
  'When this member last opened the group chat. Messages after it, from other people, are what the unread badge counts. Defaults to now() so a new member starts with a clean badge rather than the group''s whole history.';

-- Existing members start clean.
--
-- The alternative — backfilling to joined_at — would greet everybody with an
-- unread count for every message ever sent in every group they are in, on the
-- deploy that introduced the badge. Nobody has read those, strictly speaking,
-- but telling somebody they have four hundred unread messages is not a fact
-- worth being right about.
update study_group_members set last_seen_at = now();

-- -----------------------------------------------------------------------------
-- Marking a group read
-- -----------------------------------------------------------------------------

-- Stamps the caller's own membership. Takes no profile id, deliberately: a
-- parameter for whose row to touch would be a parameter somebody could pass
-- somebody else's id to.
create or replace function public.rpc_mark_group_read(target_group_id uuid)
returns timestamptz
language sql
security definer
set search_path = ''
as $$
  update public.study_group_members
  set last_seen_at = now()
  where group_id = target_group_id
    and profile_id = auth.uid()
  returning last_seen_at;
$$;

comment on function public.rpc_mark_group_read is
  'Records that the caller has just looked at a group chat. Writes last_seen_at and nothing else, for the caller and nobody else. Returns no row when they are not a member, which the caller can ignore — opening a group you are not in is already a 404.';

revoke execute on function public.rpc_mark_group_read(uuid) from public;
grant execute on function public.rpc_mark_group_read(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- How much has arrived since
-- -----------------------------------------------------------------------------

-- Counted in SQL rather than in the application, because the application cannot
-- count what it has not fetched. The Messages tab pulls a bounded window of
-- recent messages to build its previews; counting unread from that window would
-- silently undercount for any group busier than the window is wide.
--
-- NEVER COUNTS BACK BEFORE JOINING. getGroupMessages already refuses to show a
-- member anything sent before they arrived, so counting it as unread would
-- promise messages the chat will not display — a badge that cannot be cleared by
-- reading. `greatest` is what pins the floor to joined_at even if last_seen_at
-- is somehow older.
--
-- SYSTEM LINES DO NOT COUNT. "Welcome Maya to the group!" is an event, not
-- somebody talking, and a badge that lights up because a person joined sends
-- students to a chat where nothing was said.
create or replace function public.rpc_group_unread_counts()
returns table (group_id uuid, unread_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    m.group_id,
    count(msg.id)
  from public.study_group_members m
  left join public.study_group_messages msg
    on msg.group_id = m.group_id
   and msg.created_at > greatest(m.last_seen_at, m.joined_at)
   and msg.sender_id is distinct from m.profile_id
   and msg.is_system = false
  where m.profile_id = auth.uid()
  group by m.group_id;
$$;

comment on function public.rpc_group_unread_counts is
  'Per-group unread totals for the caller: messages from other people, sent after they last opened the group and after they joined it, system lines excluded. SECURITY INVOKER, so RLS still decides which memberships and messages are visible.';

revoke execute on function public.rpc_group_unread_counts() from public;
grant execute on function public.rpc_group_unread_counts() to authenticated;
