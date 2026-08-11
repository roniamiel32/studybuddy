-- =============================================================================
-- File:        supabase/migrations/20260811140000_deleted_message_authors.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: A student who posted in a group chat can delete their account.
--
--              A PRE-EXISTING BUG, found while testing Phase 7 rather than caused
--              by it. study_group_messages.sender_id is `on delete set null`, so
--              deleting a student makes PostgreSQL null the sender of everything
--              they wrote. The Phase 5 CHECK then refuses it:
--
--                (is_system and sender_id is null)
--                or (not is_system and sender_id is not null)
--
--              A human message with no sender fails both arms, so the update
--              fails, so the DELETE of auth.users fails. Anyone who had ever
--              spoken in a group chat was silently unable to leave the product —
--              and the e2e suites, which delete their fixtures the same way, were
--              quietly accumulating students nobody had asked to keep.
--
--              THE CHECK MEANT ONE THING AND SAID TWO. Its purpose is that a
--              SYSTEM message is never attributed to a person; the second arm was
--              a statement about human messages that only happened to be true
--              while nobody had left. Null sender now has a third meaning the UI
--              can render honestly: a former member.
--
--              The alternative was `on delete cascade` — deleting the account
--              deletes what they said. Phase 3 rejected that for one-to-one
--              messages ("a thread is a shared record, and letting one side erase
--              a message rewrites the other side's history") and it is no more
--              true here, where the record is shared with a whole group.
-- Version:     0.19.0
--
-- Modifications:
--     0.19.0 - 2026-08-11 - Initial fix
-- =============================================================================

alter table study_group_messages
  drop constraint study_group_messages_system_has_no_sender;

alter table study_group_messages
  add constraint study_group_messages_system_has_no_sender
    check (not (is_system and sender_id is not null));

comment on constraint study_group_messages_system_has_no_sender on study_group_messages is
  'A system message is never attributed to a person. A human message may lose its sender when that student deletes their account, and the UI renders it as a former member.';

comment on column study_group_messages.sender_id is
  'Null for a system message, and for a human message whose author has since deleted their account. is_system is what tells the two apart.';
