-- =============================================================================
-- File:        supabase/migrations/20260813210000_dismiss_and_hide.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Putting things away — a notification you have finished with, and a
--              conversation you would rather not see.
--
--              NOTIFICATIONS ARE DISMISSED, NOT DELETED, and that is not
--              squeamishness about data. Four notification types have no event
--              behind them — birthdays, strong new matches, suggestions and the
--              prompt to rate someone — and rpc_sync_notifications rebuilds them
--              on every visit to the feed, kept idempotent by partial unique
--              indexes and `on conflict do nothing`. Delete the row and that
--              conflict disappears with it: the next sync writes it straight
--              back, and the X does nothing. A dismissed row stays where the
--              index can see it.
--
--              HIDING IS ONE-SIDED BY CONSTRUCTION. A row per (person, thread)
--              rather than a flag on the thread means the other participant's
--              view is not something this feature can reach even by accident.
--              They keep the conversation and its whole history.
--
--              AND HIDING IS NOT FOREVER. `hidden_at` is a timestamp rather than
--              a boolean so a thread comes back when somebody says something new
--              — the reading every messaging product has taught people to expect,
--              and the only one that does not silently swallow a reply. Clearing
--              a conversation is tidying, not blocking.
-- Version:     0.28.0
--
-- Modifications:
--     0.28.0 - 2026-08-13 - Initial implementation (Phase 9F)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Part 1: dismissing a notification
-- -----------------------------------------------------------------------------

alter table notifications
  add column dismissed_at timestamptz;

comment on column notifications.dismissed_at is
  'When the recipient dismissed this from their feed. Null means visible. Kept rather than deleted so the partial unique indexes still stop rpc_sync_notifications from rebuilding a derived notification the student has already put away.';

-- The feed and the badge both read "mine, not dismissed", so the index says so.
create index notifications_visible_idx
  on notifications (recipient_id, created_at desc)
  where dismissed_at is null;

-- No policy change is needed: "you can mark your own notifications read" is an
-- UPDATE policy on recipient_id = auth.uid(), and freeze_notification guards the
-- columns that must not move — recipient, type, subject, created_at — while
-- leaving read_at and now dismissed_at free. Dismissing is the same shape of act
-- as marking read, and the same rule already covers it.

-- -----------------------------------------------------------------------------
-- Part 2: hiding a thread from your own Messages list
-- -----------------------------------------------------------------------------

create table hidden_threads (
  profile_id      uuid not null references profiles (id) on delete cascade,
  -- Exactly one of these is set. Two nullable foreign keys rather than a
  -- (kind, id) pair, so the database still enforces that the thread exists and
  -- still cleans up after itself when one is deleted.
  conversation_id uuid references conversations (id) on delete cascade,
  group_id        uuid references study_groups (id) on delete cascade,
  hidden_at       timestamptz not null default now(),
  constraint hidden_threads_one_target check (num_nonnulls(conversation_id, group_id) = 1)
);

comment on table hidden_threads is
  'Threads a student has cleared from their own Messages list. One row per person per thread, so hiding is never visible to the other participant. hidden_at is compared against the thread''s latest message: anything newer brings it back.';

-- One row per person per thread, and re-hiding is an upsert onto it rather than
-- a second row. Partial, because only one of the two columns is ever set.
create unique index hidden_threads_conversation_idx
  on hidden_threads (profile_id, conversation_id)
  where conversation_id is not null;

create unique index hidden_threads_group_idx
  on hidden_threads (profile_id, group_id)
  where group_id is not null;

grant all privileges on public.hidden_threads to service_role;
grant select, insert, update, delete on public.hidden_threads to authenticated;

alter table hidden_threads enable row level security;

-- Every policy is `profile_id = auth.uid()`, including SELECT. Whether somebody
-- has cleared a conversation is between them and their own list; the other
-- participant has no business reading it, and nothing in the product needs to.
create policy "you see only your own hidden threads"
  on public.hidden_threads for select to authenticated
  using (profile_id = auth.uid());

create policy "you can hide a thread for yourself"
  on public.hidden_threads for insert to authenticated
  with check (profile_id = auth.uid());

create policy "you can re-hide your own thread"
  on public.hidden_threads for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "you can unhide your own thread"
  on public.hidden_threads for delete to authenticated
  using (profile_id = auth.uid());
