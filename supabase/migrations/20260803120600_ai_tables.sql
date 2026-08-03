-- =============================================================================
-- File:        supabase/migrations/20260803120600_ai_tables.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: The AI re-rank cache (decision D4) and the generation log that
--              backs per-user rate limiting and cost reporting.
-- Version:     0.3.0
--
-- Modifications:
--     0.3.0 - 2026-08-03 - Initial schema (Phase 1a)
-- =============================================================================

create table match_scores (
  id                 uuid primary key default gen_random_uuid(),
  -- The viewer. Scores are DIRECTIONAL: A's ranking of B is not B's ranking of
  -- A, because the prompt is written from the viewer's perspective.
  profile_id         uuid not null references profiles (id) on delete cascade,
  candidate_id       uuid not null references profiles (id) on delete cascade,
  course_offering_id uuid not null references course_offerings (id) on delete cascade,
  -- Deterministic score from the SQL prefilter. Always present.
  rule_score         numeric(5, 2) not null check (rule_score between 0 and 100),
  -- AI columns are nullable BY DESIGN. This is the graceful-degradation
  -- contract: a failed or unconfigured AI call still leaves a usable
  -- rule_score row, and the UI simply omits the "why you match" line.
  ai_score           numeric(5, 2) check (ai_score between 0 and 100),
  ai_rank            smallint check (ai_rank > 0),
  ai_reason          text check (char_length(ai_reason) <= 280),
  model              text check (char_length(model) <= 80),
  computed_at        timestamptz not null default now(),
  expires_at         timestamptz not null,
  constraint match_scores_unique_per_viewer_candidate_offering
    unique (profile_id, candidate_id, course_offering_id),
  constraint match_scores_not_self check (profile_id <> candidate_id),
  constraint match_scores_expiry_after_computation check (expires_at > computed_at)
);

comment on table match_scores is
  'Decision D4 cache. Written only by the AI route handlers via the service role; readable only by the viewer it belongs to.';

comment on column match_scores.ai_reason is
  'One sentence shown on the match card. AI output, therefore untrusted display copy — never used for authorization.';

create index match_scores_viewer_offering_rank_idx
  on match_scores (profile_id, course_offering_id, ai_rank);

create index match_scores_expires_at_idx on match_scores (expires_at);

-- -----------------------------------------------------------------------------
-- Generation log
-- -----------------------------------------------------------------------------

create table ai_generation_log (
  id                uuid primary key default gen_random_uuid(),
  -- Nullable so a deleted student's cost history survives for the report.
  profile_id        uuid references profiles (id) on delete set null,
  task              ai_task not null,
  model             text not null check (char_length(model) <= 80),
  prompt_tokens     integer check (prompt_tokens >= 0),
  completion_tokens integer check (completion_tokens >= 0),
  latency_ms        integer check (latency_ms >= 0),
  status            ai_status not null,
  error_message     text check (char_length(error_message) <= 500),
  created_at        timestamptz not null default now()
);

comment on table ai_generation_log is
  'Backs the per-user daily rate limit (design section 6.4) and the cost section of the final report. Append-only from the application.';

-- The rate limit counts a user's rows within a rolling window, so the index
-- leads with profile_id and orders by time.
create index ai_generation_log_profile_created_idx
  on ai_generation_log (profile_id, created_at desc);
