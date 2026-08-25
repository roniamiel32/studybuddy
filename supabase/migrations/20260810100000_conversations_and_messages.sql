-- =============================================================================
-- File:        supabase/migrations/20260810100000_conversations_and_messages.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Phase 3 — in-app conversations and messages, with the RLS that
--              keeps a conversation private to the two people in it.
--
--              THE SHAPE: one conversation per PAIR, not per course. A
--              connection request is per-course (D2) because the unit of
--              interest is "a partner for Computational Models", but a
--              conversation is between two people — splitting the same two
--              students into one thread per shared course would fragment a
--              single human exchange. The course they matched on is recorded on
--              the row instead, so the header can still say what brought them
--              together.
--
--              WHAT RLS HAS TO DO HERE is different from every other table so
--              far. Elsewhere the rule is "your university"; here it is "you are
--              one of exactly two people", which is stricter. Same-university is
--              still enforced on insert, but it is not sufficient on its own:
--              every classmate shares a university, and none of them may read
--              this thread.
-- Version:     0.12.0
--
-- Modifications:
--     0.12.0 - 2026-08-10 - Initial schema (Phase 3)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Conversations
-- -----------------------------------------------------------------------------

create table conversations (
  id                 uuid primary key default gen_random_uuid(),
  -- Two participants, unordered. Named a/b rather than initiator/recipient
  -- because after the first message the distinction stops meaning anything, and
  -- a name that lies is worse than a dull one.
  participant_a      uuid not null references profiles (id) on delete cascade,
  participant_b      uuid not null references profiles (id) on delete cascade,
  -- Denormalised for the same reason as enrollments.university_id: the RLS
  -- check runs on every row read and must not need a join.
  university_id      uuid not null references universities (id) on delete cascade,
  -- The course that brought them together, for the chat header. Nullable and
  -- `set null` on delete: losing a course must not destroy the conversation.
  course_offering_id uuid references course_offerings (id) on delete set null,
  -- Maintained by trigger. Ordering the Requests list by this is the whole
  -- reason it exists — doing it with a correlated max(created_at) subquery
  -- would re-read the messages table for every row in the list.
  last_message_at    timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  constraint conversations_no_self check (participant_a <> participant_b)
);

comment on table conversations is
  'A one-to-one thread between two students. Readable only by its two participants — same-university is necessary but nowhere near sufficient here.';

-- One conversation per pair, in EITHER direction.
--
-- least/greatest makes the pair unordered, exactly as
-- connection_requests_one_live_per_pair_per_course_idx does. Without it, both
-- students pressing "Send message" at the same moment create two threads and
-- each then sees half the exchange.
create unique index conversations_one_per_pair_idx
  on conversations (least(participant_a, participant_b), greatest(participant_a, participant_b));

-- The Requests list reads "my conversations, newest first", twice per student.
create index conversations_participant_a_recent_idx
  on conversations (participant_a, last_message_at desc);

create index conversations_participant_b_recent_idx
  on conversations (participant_b, last_message_at desc);

-- -----------------------------------------------------------------------------
-- Messages
-- -----------------------------------------------------------------------------

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id       uuid not null references profiles (id) on delete cascade,
  body            text not null check (char_length(btrim(body)) between 1 and 2000),
  -- Requested explicitly, and the authoritative flag the badge counts.
  is_read         boolean not null default false,
  -- Derived from is_read by trigger, never set by the application. The chat
  -- design shows "Read 10:42", which a boolean alone cannot say; keeping the
  -- time in a column the application does not write is what stops the two from
  -- drifting apart.
  read_at         timestamptz,
  -- True for the opener written by the model. The recipient is told a message
  -- was AI-drafted rather than typed, which is the same honesty rule the course
  -- catalog follows: the app does not present generated words as a person's own.
  is_icebreaker   boolean not null default false,
  -- Provenance for the generated ones. Null for anything a student typed.
  model           text check (char_length(model) <= 80),
  created_at      timestamptz not null default now()
);

comment on table messages is
  'Messages in a conversation. No DELETE privilege by design: a thread is a shared record, and letting one side erase a message rewrites the other side''s history.';

comment on column messages.is_read is
  'False until the recipient opens the conversation. Counted for the navigation badge; only ever flipped by the recipient, never by the sender.';

comment on column messages.is_icebreaker is
  'Marks the AI-written opener so the UI can label it as generated rather than typed.';

-- The chat room reads one conversation in order; the badge counts unread rows
-- across conversations. Two access patterns, two indexes.
create index messages_conversation_created_idx
  on messages (conversation_id, created_at);

-- Partial, because a read message is never counted. This index stays small no
-- matter how much history accumulates.
create index messages_unread_by_sender_idx
  on messages (conversation_id, sender_id)
  where not is_read;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

-- Keeps read_at consistent with is_read, in both directions.
create or replace function public.sync_message_read_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_read and not old.is_read then
    new.read_at := now();
  elsif not new.is_read then
    -- Un-reading is not a feature, but if it ever happens the timestamp must
    -- not survive and claim otherwise.
    new.read_at := null;
  end if;

  return new;
end;
$$;

create trigger messages_sync_read_at
  before update on public.messages
  for each row execute function public.sync_message_read_at();

-- A message cannot be edited or reattributed.
--
-- This is the gap RLS cannot cover: a WITH CHECK sees only the new row, so it
-- can confirm who is updating but not that they left the content alone. Without
-- this trigger the recipient's "mark as read" UPDATE would also be a licence to
-- rewrite what the other person said.
create or replace function public.freeze_message_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_setting('role', true) is distinct from 'service_role'
     and (
       new.body is distinct from old.body
       or new.sender_id is distinct from old.sender_id
       or new.conversation_id is distinct from old.conversation_id
       or new.is_icebreaker is distinct from old.is_icebreaker
       or new.created_at is distinct from old.created_at
     ) then
    raise exception 'A message cannot be edited after it is sent.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger messages_freeze_content
  before update on public.messages
  for each row execute function public.freeze_message_content();

-- Moves a conversation to the top of both participants' lists.
--
-- SECURITY DEFINER is required, not a convenience. Students are deliberately
-- granted no UPDATE on conversations — last_message_at is derived, and a student
-- who could write it could reorder their own Requests list or forge activity on a
-- dormant thread. That grant is what this trigger needs, so it runs with the
-- owner's rights and writes exactly one column of exactly one row.
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;

  return new;
end;
$$;

create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

-- A conversation must not straddle two institutions.
--
-- The insert policy checks university_id against the caller's own, which stops
-- the caller lying about themselves. This stops the other half: naming a
-- participant from somewhere else entirely.
--
-- SECURITY DEFINER because it has to see BOTH profiles to compare them. Under
-- invoker rights the other student's row is filtered out by the profiles policy
-- when they are at another university — which is precisely the case this check
-- exists to catch — leaving one visible row, one distinct university, and a
-- check that passes by being blind. It discloses nothing: the only thing it can
-- report is a raised exception on a row the caller is already inserting.
create or replace function public.check_conversation_same_university()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  distinct_universities integer;
begin
  select count(distinct p.university_id)
  into distinct_universities
  from public.profiles p
  where p.id in (new.participant_a, new.participant_b);

  if distinct_universities <> 1 then
    raise exception 'A conversation must be between two students at the same university.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger conversations_same_university
  before insert or update on public.conversations
  for each row execute function public.check_conversation_same_university();

-- -----------------------------------------------------------------------------
-- Grants (layer 1 — see 20260803120900_grants.sql)
-- -----------------------------------------------------------------------------

grant all privileges on public.conversations to service_role;
grant all privileges on public.messages      to service_role;

-- No DELETE for students on either table, and no UPDATE on conversations:
-- last_message_at is the trigger's business, and the participants are settled
-- when the row is created.
grant select, insert         on public.conversations to authenticated;
grant select, insert, update on public.messages      to authenticated;

-- -----------------------------------------------------------------------------
-- Participation helper
-- -----------------------------------------------------------------------------

-- Whether the caller is in the given conversation.
--
-- Invoker rights on purpose. It reads `conversations`, which is already behind
-- the policy below, so a non-participant asking about someone else's
-- conversation gets no row and the answer is false. Making it SECURITY DEFINER
-- would hand it the power to answer questions about threads the caller cannot
-- see, for no benefit — and unlike app_current_university_id there is no
-- recursion to escape, because this is called from the messages policy, not the
-- conversations one.
create or replace function public.app_is_conversation_participant(target_conversation_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = target_conversation_id
      and auth.uid() in (c.participant_a, c.participant_b)
  );
$$;

comment on function public.app_is_conversation_participant is
  'True when the caller is one of the two participants. Invoker rights, so it can only ever confirm what the conversations policy already allows the caller to see.';

revoke execute on function public.app_is_conversation_participant(uuid) from public;
grant execute on function public.app_is_conversation_participant(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS (layer 2)
-- -----------------------------------------------------------------------------

alter table conversations enable row level security;
alter table messages      enable row level security;

-- The requested rule, stated once: you see a conversation if you are in it.
-- Note what is absent — there is no same-university clause here, because it
-- would be pure noise. Two participants is a strictly narrower condition, and
-- adding a broader one beside it invites the reader to think the tenant check is
-- doing work it is not.
create policy "you can read conversations you are part of"
  on public.conversations for select to authenticated
  using (auth.uid() in (participant_a, participant_b));

-- You may open a conversation only with someone you can actually see: same
-- university, and either discoverable or already connected. app_can_see_profile
-- is the same gate the matches list uses, so a student cannot start a thread
-- with someone the product would never have shown them.
create policy "you can start a conversation you are part of"
  on public.conversations for insert to authenticated
  with check (
    auth.uid() in (participant_a, participant_b)
    and university_id = public.app_current_university_id()
    and public.app_can_see_profile(
      case when participant_a = auth.uid() then participant_b else participant_a end
    )
  );

create policy "you can read messages in your conversations"
  on public.messages for select to authenticated
  using (public.app_is_conversation_participant(conversation_id));

-- Only as yourself, and only into a conversation you are in. Writing as someone
-- else is the attack this closes: without `sender_id = auth.uid()` a
-- participant could forge a message attributed to the other person, inside a
-- thread they are legitimately allowed to write to.
create policy "you can send messages as yourself"
  on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.app_is_conversation_participant(conversation_id)
  );

-- Marking as read, and nothing else.
--
-- `sender_id <> auth.uid()` is the important half: a sender marking their own
-- message read would let them fake the other person having seen it, and would
-- also silently clear their own badge. The freeze trigger above stops this
-- policy from being used to edit the body.
create policy "you can mark the other side's messages as read"
  on public.messages for update to authenticated
  using (
    public.app_is_conversation_participant(conversation_id)
    and sender_id <> auth.uid()
  )
  with check (
    public.app_is_conversation_participant(conversation_id)
    and sender_id <> auth.uid()
  );

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------

-- Postgres change streams for the two tables the UI has to react to.
--
-- RLS still applies to what a subscriber receives, so a student's socket only
-- carries rows from their own conversations — the same policies above, enforced
-- on the stream rather than on a query. This is why the badge can subscribe
-- broadly to `messages` without filtering by conversation: it could not receive
-- someone else's row even if it asked for it.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;

-- REPLICA IDENTITY FULL so an UPDATE carries the old row too. Without it the
-- payload for "is_read flipped" arrives with only the new values, and a client
-- cannot tell an unread-to-read transition from any other update — which is
-- exactly what the badge needs to know.
alter table public.messages replica identity full;
