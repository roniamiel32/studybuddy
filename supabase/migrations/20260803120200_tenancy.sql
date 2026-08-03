-- =============================================================================
-- File:        supabase/migrations/20260803120200_tenancy.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Multi-tenancy roots. Every tenant-scoped table carries a
--              university_id traceable back to universities.id, and the
--              signup flow resolves a student's tenant from their email
--              domain via university_domains.
-- Version:     0.3.0
--
-- Modifications:
--     0.3.0 - 2026-08-03 - Initial schema (Phase 1a)
-- =============================================================================

create table universities (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (char_length(name) between 2 and 120),
  slug                  text not null unique
                          check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  country_code          char(2) not null default 'IL',
  -- Region used to normalise phone numbers typed without a country code.
  default_phone_region  char(2) not null default 'IL',
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

comment on table universities is
  'Tenant root. Logical separation is by university_id, enforced in RLS and in query predicates.';

-- A university can own several mail domains (runi.ac.il, post.runi.ac.il).
-- The primary key is the domain alone: a domain belongs to exactly one
-- institution, and that invariant is what makes resolving a tenant from an
-- email address at signup unambiguous.
create table university_domains (
  domain            text primary key
                      check (domain = lower(domain) and domain like '%.%'),
  university_id     uuid not null references universities (id) on delete cascade,
  is_student_domain boolean not null default true,
  created_at        timestamptz not null default now()
);

create index university_domains_university_id_idx
  on university_domains (university_id);

comment on column university_domains.is_student_domain is
  'False for staff-only domains, which must not grant access to student matching.';
