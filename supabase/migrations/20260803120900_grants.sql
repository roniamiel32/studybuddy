-- =============================================================================
-- File:        supabase/migrations/20260803120900_grants.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Explicit table privileges for the Data API roles.
--
--              Supabase no longer auto-exposes new public-schema objects, and
--              the legacy `auto_expose_new_tables` escape hatch is removed on
--              2026-10-30. Granting explicitly is therefore both the
--              future-proof option and the better one: privileges are visible
--              in the schema rather than implied by a platform default.
--
--              TWO INDEPENDENT LAYERS, and both must permit an operation:
--                1. GRANT decides whether a role may touch a table at all.
--                2. RLS decides which rows it may touch.
--              Phase 1a ships layer 1 mirroring the design's section 1.9
--              matrix, with layer 2 still denying everything because no policy
--              exists yet. Phase 1b opens layer 2 deliberately, table by table.
--              `anon` is granted nothing: an unauthenticated visitor has no
--              business reading student data, and the signup flow resolves
--              email domains server-side.
-- Version:     0.3.0
--
-- Modifications:
--     0.3.0 - 2026-08-03 - Initial grants (Phase 1a)
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- service_role — the trusted server identity. Bypasses RLS, so it still needs
-- ordinary table privileges. Used by seeds, the AI route handlers and tests.
-- -----------------------------------------------------------------------------

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- -----------------------------------------------------------------------------
-- authenticated — a signed-in student. Privileges below are the *maximum* the
-- role could ever exercise; RLS narrows each to the correct rows.
-- -----------------------------------------------------------------------------

-- Reference data: read-only. Seeded and maintained via the service role.
grant select on public.universities       to authenticated;
grant select on public.university_domains to authenticated;
grant select on public.terms              to authenticated;
grant select on public.courses            to authenticated;
grant select on public.course_offerings   to authenticated;

-- Identity. No DELETE: account deletion goes through auth.users and cascades,
-- so there is no reason for a client to delete a profile row directly.
grant select, insert, update on public.profiles             to authenticated;
grant select, insert, update on public.learning_preferences to authenticated;

-- Contact details. DELETE is allowed so a student can remove their phone
-- number outright, not merely opt out of WhatsApp.
grant select, insert, update, delete on public.profile_contacts to authenticated;

-- Student-owned declarations, fully editable by their owner.
grant select, insert, update, delete on public.enrollments        to authenticated;
grant select, insert, update, delete on public.availability_slots to authenticated;

-- Requests are never deleted, only transitioned to cancelled or declined:
-- the history is what stops a blocked or rejected pair silently retrying.
grant select, insert, update on public.connection_requests to authenticated;

-- Blocks are added and lifted, never edited.
grant select, insert, delete on public.blocked_users to authenticated;

-- AI cache. Written exclusively by the route handlers via the service role;
-- a student may read their own rows and may discard them to force a refresh.
grant select, delete on public.match_scores to authenticated;

-- Cost and rate-limit log. Read-only to the student it belongs to; writes are
-- server-side only, otherwise a client could erase its own rate limit.
grant select on public.ai_generation_log to authenticated;
