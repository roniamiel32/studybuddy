-- =============================================================================
-- File:        supabase/migrations/20260812120000_notification_types.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Phase 8D, part one — the new notification types, alone.
--
--              THIS FILE EXISTS ONLY BECAUSE OF A POSTGRES RULE. A value added
--              to an enum cannot be USED in the same transaction that added it,
--              and Supabase runs each migration file in one transaction. The
--              CHECK constraint and the triggers in the next migration reference
--              these labels, so they have to be committed first.
--
--              Splitting it is the whole reason for the file; there is nothing
--              else in here on purpose.
-- Version:     0.22.0
--
-- Modifications:
--     0.22.0 - 2026-08-12 - Social and rating notification types (Phase 8D)
-- =============================================================================

alter type notification_type add value if not exists 'wall_post';
alter type notification_type add value if not exists 'post_like';
alter type notification_type add value if not exists 'post_comment';
alter type notification_type add value if not exists 'post_share';
alter type notification_type add value if not exists 'comment_reply';
alter type notification_type add value if not exists 'comment_like';
alter type notification_type add value if not exists 'group_invite';
alter type notification_type add value if not exists 'rate_partner';
