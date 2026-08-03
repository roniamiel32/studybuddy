-- =============================================================================
-- File:        supabase/seed/01_universities.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Tenant reference data. Reichman University is the initial
--              rollout target; a second institution is seeded deliberately so
--              the Phase 1b RLS tests have a genuine cross-tenant boundary to
--              attack. A multi-tenancy claim tested against a single tenant is
--              not tested at all.
-- Version:     0.3.0
--
-- Modifications:
--     0.3.0 - 2026-08-03 - Initial seed (Phase 1a)
-- =============================================================================

-- Deterministic UUIDs so seeds, tests and fixtures can reference rows by
-- literal without a lookup, and so re-seeding is stable.
insert into universities (id, name, slug, country_code, default_phone_region)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'Reichman University',
    'runi',
    'IL',
    'IL'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'Tel Aviv University',
    'tau',
    'IL',
    'IL'
  )
on conflict (id) do nothing;

-- Reichman issues student addresses on post.runi.ac.il and staff/general
-- addresses on runi.ac.il. Only the student domain grants access to matching.
insert into university_domains (domain, university_id, is_student_domain)
values
  ('post.runi.ac.il', '11111111-1111-4111-8111-111111111111', true),
  ('runi.ac.il',      '11111111-1111-4111-8111-111111111111', false),
  ('mail.tau.ac.il',  '22222222-2222-4222-8222-222222222222', true)
on conflict (domain) do nothing;
