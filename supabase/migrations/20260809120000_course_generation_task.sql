-- =============================================================================
-- File:        supabase/migrations/20260809120000_course_generation_task.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Adds a task value for course generation.
--
--              The Smart Course API logs its calls to ai_generation_log for rate
--              limiting, and recording them as 'match_rerank' would make the
--              cost report wrong about what the money was spent on.
-- Version:     0.10.0
--
-- Modifications:
--     0.10.0 - 2026-08-09 - Add 'course_generation' to ai_task
-- =============================================================================

alter type ai_task add value if not exists 'course_generation';
