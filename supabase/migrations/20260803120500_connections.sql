-- =============================================================================
-- File:        supabase/migrations/20260803120500_connections.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: The connection request lifecycle (decision D2) and the block
--              list. A request is per-course, because the product's unit of
--              interest is "a study partner for Computational Models", not a
--              general friendship.
-- Version:     0.3.0
--
-- Modifications:
--     0.3.0 - 2026-08-03 - Initial schema (Phase 1a)
-- =============================================================================

create table connection_requests (
  id                 uuid primary key default gen_random_uuid(),
  requester_id       uuid not null references profiles (id) on delete cascade,
  addressee_id       uuid not null references profiles (id) on delete cascade,
  course_offering_id uuid not null references course_offerings (id) on delete cascade,
  -- Denormalised for the same reason as enrollments.university_id.
  university_id      uuid not null references universities (id) on delete cascade,
  status             connection_status not null default 'pending',
  -- The AI-generated opener actually sent, kept for provenance and for the
  -- WhatsApp handoff to reuse verbatim after acceptance.
  icebreaker_text    text check (char_length(icebreaker_text) <= 600),
  icebreaker_model   text check (char_length(icebreaker_model) <= 80),
  student_note       text check (char_length(student_note) <= 200),
  responded_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint connection_requests_no_self check (requester_id <> addressee_id)
);

comment on table connection_requests is
  'Decision D2: direct request with accept/decline. No swipe table and no mutual-like requirement, so there is no cold-start deadlock.';

comment on column connection_requests.icebreaker_text is
  'AI output. Advisory content only — it never influences an authorization decision.';

-- One live request per pair per course, in EITHER direction.
--
-- least/greatest makes the pair unordered, so A->B and B->A collide. Without
-- this, two students can each send the other a pending request and neither can
-- act: both see an incoming request and an outgoing one for the same course.
-- Declined and cancelled rows are excluded so a pair can try again later.
create unique index connection_requests_one_live_per_pair_per_course_idx
  on connection_requests (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id),
    course_offering_id
  )
  where status in ('pending', 'accepted');

create index connection_requests_addressee_status_idx
  on connection_requests (addressee_id, status);

create index connection_requests_requester_status_idx
  on connection_requests (requester_id, status);

-- -----------------------------------------------------------------------------
-- Block list
-- -----------------------------------------------------------------------------

create table blocked_users (
  blocker_id uuid not null references profiles (id) on delete cascade,
  blocked_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocked_users_no_self check (blocker_id <> blocked_id)
);

comment on table blocked_users is
  'Excludes a pair from candidate lists in BOTH directions. The way out after a bad interaction, which matters more here than usual because the product hands out phone numbers.';

-- Blocks are checked from both sides during matching, so the reverse lookup
-- needs its own index.
create index blocked_users_blocked_id_idx on blocked_users (blocked_id);
