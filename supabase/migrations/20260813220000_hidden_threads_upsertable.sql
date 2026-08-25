-- =============================================================================
-- File:        supabase/migrations/20260813220000_hidden_threads_upsertable.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Making hidden_threads upsertable.
--
--              THE PARTIAL INDEXES WERE UNREACHABLE FROM ON CONFLICT. Postgres
--              will only use a partial unique index to resolve a conflict if the
--              statement repeats the index's WHERE predicate — `on conflict
--              (profile_id, conversation_id) where conversation_id is not null` —
--              and supabase-js has no way to send that. Every upsert failed with
--              "there is no unique or exclusion constraint matching the ON
--              CONFLICT specification", so clearing a thread silently did
--              nothing.
--
--              PLAIN UNIQUE INDEXES DO THE SAME JOB HERE. Postgres treats NULLs
--              as distinct in a unique index, so a plain index on
--              (profile_id, conversation_id) still refuses two rows for the same
--              person and conversation, while happily allowing the many rows
--              where conversation_id is null because they are group rows. The
--              CHECK constraint is what guarantees exactly one of the two columns
--              is ever set, so nothing is lost by dropping the predicates.
-- Version:     0.28.0
--
-- Modifications:
--     0.28.0 - 2026-08-13 - Initial implementation (Phase 9F)
-- =============================================================================

drop index if exists hidden_threads_conversation_idx;
drop index if exists hidden_threads_group_idx;

create unique index hidden_threads_conversation_idx
  on hidden_threads (profile_id, conversation_id);

create unique index hidden_threads_group_idx
  on hidden_threads (profile_id, group_id);
