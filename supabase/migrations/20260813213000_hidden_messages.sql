-- =============================================================================
-- File:        supabase/migrations/20260813213000_hidden_messages.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Hiding one message inside a conversation, for one person.
--
--              THE TABLE THE APPLICATION WAS ALREADY WRITING TO. `dismissMessage`
--              and `getMessages` in features/chat referenced `hidden_messages`
--              through `as any` casts, which is why it compiled — and why
--              nothing said that the table had never been created. The read side
--              failed softly (no rows back, so nothing was filtered) and the
--              write side failed every time, returning "we could not dismiss this
--              message". This is the missing half.
--
--              THE SIBLING OF hidden_threads, AT A DIFFERENT GRAIN. That one
--              clears a whole conversation from the Messages list and lets it
--              back when somebody replies; this one takes a single message out of
--              a chat and keeps it out. Both are per-profile rows, so both are
--              invisible to the other participant — which is the property that
--              matters and the reason neither is a column on the thing being
--              hidden.
--
--              NO TIMESTAMP HERE, unlike hidden_threads. A hidden message has
--              nothing that could later make it relevant again: it will not be
--              edited and cannot be re-sent, so there is no event to compare
--              against. Presence of the row is the whole answer.
-- Version:     0.28.0
--
-- Modifications:
--     0.28.0 - 2026-08-13 - Initial implementation (Phase 9F)
-- =============================================================================

create table hidden_messages (
  profile_id uuid not null references profiles (id) on delete cascade,
  message_id uuid not null references messages (id) on delete cascade,
  hidden_at  timestamptz not null default now(),
  -- One row per person per message; hiding twice is the same as hiding once.
  primary key (profile_id, message_id)
);

comment on table hidden_messages is
  'Messages a student has hidden from their own view of a conversation. One row per person per message, so the other participant still sees the message and its place in the thread.';

create index hidden_messages_profile_idx on hidden_messages (profile_id);

grant all privileges on public.hidden_messages to service_role;
-- No UPDATE: a message is hidden or it is not.
grant select, insert, delete on public.hidden_messages to authenticated;

alter table hidden_messages enable row level security;

-- Every policy is `profile_id = auth.uid()`, SELECT included. Which messages
-- somebody has hidden from their own view is nobody else's business, and no part
-- of the product needs to ask.
create policy "you see only your own hidden messages"
  on public.hidden_messages for select to authenticated
  using (profile_id = auth.uid());

-- The message must be one the caller can already read. Without this check the
-- table would accept a row for any message id, which turns it into a way of
-- confirming that a given id exists.
create policy "you can hide a message you can see"
  on public.hidden_messages for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.app_is_conversation_participant(m.conversation_id)
    )
  );

create policy "you can unhide your own message"
  on public.hidden_messages for delete to authenticated
  using (profile_id = auth.uid());
