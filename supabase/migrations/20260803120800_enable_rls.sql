-- =============================================================================
-- File:        supabase/migrations/20260803120800_enable_rls.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Enables Row Level Security on every table, with NO policies.
--
--              RLS with no policy denies everything to anon and authenticated,
--              which is the correct state to leave Phase 1a in: the schema
--              exists and is completely inaccessible to clients until Phase 1b
--              grants access deliberately, policy by policy. Enabling RLS
--              first and adding policies second means the schema is never
--              briefly world-readable — the opposite order would leave a
--              window where every table is exposed.
--
--              The service role bypasses RLS, so seeds and the AI route
--              handlers keep working throughout.
-- Version:     0.3.0
--
-- Modifications:
--     0.3.0 - 2026-08-03 - Initial schema (Phase 1a)
-- =============================================================================

alter table public.universities         enable row level security;
alter table public.university_domains   enable row level security;
alter table public.profiles             enable row level security;
alter table public.profile_contacts     enable row level security;
alter table public.learning_preferences enable row level security;
alter table public.terms                enable row level security;
alter table public.courses              enable row level security;
alter table public.course_offerings     enable row level security;
alter table public.enrollments          enable row level security;
alter table public.availability_slots   enable row level security;
alter table public.connection_requests  enable row level security;
alter table public.blocked_users        enable row level security;
alter table public.match_scores         enable row level security;
alter table public.ai_generation_log    enable row level security;
