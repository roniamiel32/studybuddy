-- =============================================================================
-- File:        supabase/migrations/20260818120000_google_calendar.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Storage for the opt-in Google Calendar integration.
--
--              THE TOKENS ARE NOT ON `profiles`, AND THAT IS DELIBERATE.
--              `profiles` is SELECTable by classmates — that is what
--              app_can_see_profile exists for — so a refresh token stored there
--              would be a live, long-lived Google credential handed to every
--              student at the same university. They live in their own table
--              instead, with RLS on and NO policy for `authenticated` and no
--              grant either: the only role that can read them is the service
--              role, used by the route handler and the sync actions. A student
--              cannot read their own tokens through the API, which is correct —
--              nothing in the browser has any use for them.
--
--              What the browser DOES need is one bit: am I connected. That is a
--              boolean, and it goes on profile_private rather than profiles for
--              the same reason as the tokens, just weaker — whether a classmate
--              syncs their calendar is nobody's business but theirs.
--
--              WRITE-SYNC BOOKKEEPING lives in `calendar_event_links`: one row
--              per (meeting, profile) that has a Google event, holding the id
--              Google gave us. Without it, removing an event on RSVP-cancel
--              would mean searching somebody's calendar by guesswork.
-- Version:     0.46.0
--
-- Modifications:
--     0.46.0 - 2026-08-18 - Initial implementation (two-way calendar sync)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The connection itself
-- -----------------------------------------------------------------------------

create table if not exists calendar_connections (
  profile_id        uuid primary key references profiles (id) on delete cascade,
  provider          text        not null default 'google'
                                check (provider in ('google')),
  -- Short-lived. Refreshed from refresh_token whenever it is within the skew.
  access_token      text        not null,
  -- Google only returns this on the FIRST consent, so it is nullable and must
  -- never be overwritten with null on a later exchange. See the upsert in
  -- src/features/calendar/connection.ts.
  refresh_token     text,
  expires_at        timestamptz,
  -- What the student actually granted, so a scope added later can be detected
  -- rather than assumed.
  scope             text,
  -- The calendar's own timezone, which is the only correct basis for turning an
  -- absolute busy interval into the wall-clock time our availability rows hold.
  calendar_timezone text,
  -- Shown in the UI so a student with several Google accounts can see which one
  -- is connected. Not used for auth.
  google_email      text,
  last_synced_at    timestamptz,
  last_sync_error   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table calendar_connections is
  'OAuth credentials for a student''s connected calendar. Service-role only: RLS is on and there is deliberately no policy and no grant for `authenticated`, because a refresh token is a durable credential and nothing in the browser needs it.';

comment on column calendar_connections.refresh_token is
  'Present only from the first consent. Never overwrite with null — a re-consent that omits it must leave the stored one in place, or the connection silently dies at the next token expiry.';

create trigger calendar_connections_set_updated_at
  before update on calendar_connections
  for each row execute function set_updated_at();

alter table calendar_connections enable row level security;

-- No policies, and no grants. Service role bypasses RLS; everyone else,
-- including the token's own owner, is refused.

-- -----------------------------------------------------------------------------
-- Which meetings we have written into which calendars
-- -----------------------------------------------------------------------------

create table if not exists calendar_event_links (
  meeting_id       uuid        not null references meetings (id) on delete cascade,
  profile_id       uuid        not null references profiles (id) on delete cascade,
  -- The id Google assigned. Needed to delete or patch the event later.
  google_event_id  text        not null,
  created_at       timestamptz not null default now(),
  primary key (meeting_id, profile_id)
);

comment on table calendar_event_links is
  'One row per meeting we have mirrored into one student''s Google Calendar. The row is what makes removal possible: without it, un-RSVPing would mean searching their calendar for something that looks like our event.';

create index if not exists calendar_event_links_profile_idx
  on calendar_event_links (profile_id);

alter table calendar_event_links enable row level security;

-- Readable by its owner, so the UI can say "this is in your calendar". Writes
-- are server-side only: the row must agree with what is actually in Google, and
-- only the code that called Google knows that.
grant select on public.calendar_event_links to authenticated;

create policy "your calendar links are yours alone"
  on public.calendar_event_links for select to authenticated
  using (profile_id = auth.uid());

-- -----------------------------------------------------------------------------
-- The one bit the browser needs
-- -----------------------------------------------------------------------------

alter table profile_private
  add column if not exists google_calendar_sync_enabled boolean not null default false;

comment on column profile_private.google_calendar_sync_enabled is
  'Whether read sync is on. On profile_private rather than profiles because whether a student syncs their calendar is not a fact their classmates need.';
