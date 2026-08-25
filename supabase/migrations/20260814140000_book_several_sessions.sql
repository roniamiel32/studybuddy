-- =============================================================================
-- File:        supabase/migrations/20260814140000_book_several_sessions.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: Booking a whole run of sessions in one act.
--
--              THE PICKER NOW TAKES MORE THAN ONE ANSWER. Selecting Tuesday
--              afternoon and Thursday evening produces two sessions, and doing
--              that as two round trips from the client is the bug this function
--              exists to prevent: the second call can fail on a clash after the
--              first has already committed, leaving the student booked for half
--              of what they asked for and no obvious way back.
--
--              ALL OR NOTHING, BY DOING NOTHING SPECIAL. There is no exception
--              handler here on purpose — any failure inside the loop aborts the
--              whole function, and with it the transaction and every meeting
--              already inserted. "Somebody took one of those times, pick again"
--              is a sentence a student can act on. "Three of your four sessions
--              were booked" is not.
--
--              IT REUSES rpc_create_meeting RATHER THAN REIMPLEMENTING IT. That
--              function resolves the participants, takes one advisory lock per
--              participant in sorted order, and lets the clash trigger fire per
--              attendee row. Every one of those still applies per call, and the
--              locks cost nothing to retake: pg_advisory_xact_lock is held to the
--              end of the transaction, so the second and later calls acquire
--              locks this transaction already owns. Copying the body to "make it
--              one pass" would duplicate the lock ordering, which is the one part
--              of this that must never drift between two implementations.
--
--              THE CAP IS A GUARD, NOT A PRODUCT RULE. Twenty is far above any
--              real selection — the grid offers seven days of at most seven
--              blocks, and contiguous ones merge before they arrive here — and
--              far below a number that would hold locks long enough to matter.
-- Version:     0.30.0
--
-- Modifications:
--     0.30.0 - 2026-08-14 - Initial implementation (Phase 9H)
-- =============================================================================

create or replace function public.rpc_create_meetings(
  p_title text,
  p_starts_at timestamptz[],
  p_ends_at timestamptz[],
  p_conversation_id uuid default null,
  p_group_id uuid default null,
  p_location text default null
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count       int;
  v_index       int;
  v_meeting_id  uuid;
  v_meeting_ids uuid[] := '{}';
begin
  v_count := coalesce(array_length(p_starts_at, 1), 0);

  if v_count = 0 then
    raise exception 'Pick at least one time.'
      using errcode = '22023';
  end if;

  if v_count <> coalesce(array_length(p_ends_at, 1), 0) then
    raise exception 'Every session needs both a start and an end.'
      using errcode = '22023';
  end if;

  if v_count > 20 then
    raise exception 'That is more sessions than can be booked at once.'
      using errcode = '22023';
  end if;

  for v_index in 1 .. v_count loop
    v_meeting_id := public.rpc_create_meeting(
      p_title           => p_title,
      p_starts_at       => p_starts_at[v_index],
      p_ends_at         => p_ends_at[v_index],
      p_conversation_id => p_conversation_id,
      p_group_id        => p_group_id,
      p_location        => p_location
    );

    v_meeting_ids := v_meeting_ids || v_meeting_id;
  end loop;

  return v_meeting_ids;
end;
$$;

comment on function public.rpc_create_meetings is
  'Books every session the picker selected, in one transaction. Delegates each one to rpc_create_meeting so the participant resolution, the advisory lock order and the clash trigger stay defined in exactly one place. Any failure rolls back the whole selection.';

grant execute on function public.rpc_create_meetings to authenticated;
