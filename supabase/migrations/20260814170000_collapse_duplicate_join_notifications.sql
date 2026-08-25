-- =============================================================================
-- File:        supabase/migrations/20260814170000_collapse_duplicate_join_notifications.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Clearing up after the delete-and-reinsert in requestToJoin.
--
--              THERE IS NO SCHEMA CHANGE HERE, AND THAT IS THE POINT. The
--              duplicate "Pending" cards looked like a missing constraint, so
--              the obvious move was to drop or widen
--              `group_requests_one_live_per_student_idx`. It is already exactly
--              right: a PARTIAL unique index over (group_id, requester_id)
--              `where status in ('pending','approved')`. Rejected rows fall
--              outside it, so asking again after a refusal — or after leaving —
--              is a plain INSERT with a new id and a new created_at. Nothing
--              needed clearing out of the way, and dropping the index would have
--              removed the only thing enforcing one live request per student.
--
--              WHAT ACTUALLY HAPPENED was in the application. requestToJoin
--              caught the 23505, opened a service-role client, deleted every
--              group_requests row for the pair — decided ones included — and
--              re-inserted a pending one. That bypassed both guards at once:
--              `authenticated` has no DELETE grant on the table, and
--              `freeze_group_request` exempts service_role. Each pass re-fired
--              notify_group_request, and group_request has no partial unique
--              index to collapse onto the way birthdays and suggestions do, so
--              the feed accumulated one row per click. Measured: three extra
--              clicks turned one request and two notifications into one request,
--              NO history, and five notifications.
--
--              THE ROWS ARE DISMISSED, NOT DELETED, matching how notifications
--              are retired everywhere else in this schema. It also keeps the
--              evidence: the duplicates are the record of a bug, and a support
--              question about a feed that once showed nine identical cards has
--              something to look at.
--
--              NO NEW UNIQUE INDEX ON group_request NOTIFICATIONS, deliberately.
--              One over (recipient_id, actor_id, group_id) would look like the
--              matching guard the derived types have, and would break the second
--              of the four rules this feature is meant to keep: a student who is
--              rejected and asks again months later is making a NEW request, and
--              the admin has to be told about it. Those types are idempotent
--              because they are recomputed from a standing fact; this one is an
--              event, and events repeat legitimately.
-- Version:     0.31.0
--
-- Modifications:
--     0.31.0 - 2026-08-14 - Initial implementation (Phase 9I)
-- =============================================================================

-- Keep the newest notification per (recipient, requester, group); dismiss the
-- rest. Newest rather than oldest because it is the one whose timestamp matches
-- the request currently sitting in the feed.
with ranked as (
  select
    n.id,
    row_number() over (
      partition by n.recipient_id, n.actor_id, n.group_id
      order by n.created_at desc, n.id desc
    ) as rank
  from public.notifications n
  where n.type = 'group_request'
    and n.dismissed_at is null
)
update public.notifications n
set dismissed_at = now()
from ranked
where n.id = ranked.id
  and ranked.rank > 1;
