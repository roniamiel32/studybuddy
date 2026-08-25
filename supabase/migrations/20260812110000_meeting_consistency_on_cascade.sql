-- =============================================================================
-- File:        supabase/migrations/20260812110000_meeting_consistency_on_cascade.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: A student who organised a meeting can delete their account.
--
--              THE THIRD TIME THIS SHAPE HAS BITTEN, and it is worth naming so
--              it does not become the fourth. A column with `on delete set null`
--              turns account deletion into an UPDATE on some other table. Any
--              trigger on that table then runs mid-cascade, in a world where the
--              rows it wants to read may already be gone.
--
--              Here: meetings.created_by is `set null`, so deleting the organiser
--              updates the meeting; check_meeting_consistency then looks up the
--              conversation the meeting belongs to — which the same cascade has
--              already removed — finds nothing, and refuses. The account deletion
--              fails with it.
--
--              THE CHECK ITSELF IS STILL RIGHT. It stops a hand-built row naming
--              a chat at another university. What was wrong was running it when
--              the chat is not what changed: re-validating an unrelated UPDATE
--              buys nothing and, during a cascade, cannot even be done.
-- Version:     0.21.0
--
-- Modifications:
--     0.21.0 - 2026-08-12 - Scope is only checked when the scope changes
-- =============================================================================

create or replace function public.check_meeting_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope_university uuid;
begin
  -- Only when the chat is what is being set or moved. On any other update — the
  -- organiser being nulled by a cascade, a title being fixed — there is nothing
  -- here to verify.
  if tg_op = 'UPDATE'
     and new.conversation_id is not distinct from old.conversation_id
     and new.group_id is not distinct from old.group_id
     and new.university_id is not distinct from old.university_id then
    return new;
  end if;

  if new.conversation_id is not null then
    select c.university_id into v_scope_university
    from public.conversations c
    where c.id = new.conversation_id;
  else
    select g.university_id into v_scope_university
    from public.study_groups g
    where g.id = new.group_id;
  end if;

  if v_scope_university is null or v_scope_university <> new.university_id then
    raise exception 'A meeting must belong to a chat at its own university.'
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' and new.starts_at <= now() then
    raise exception 'A meeting cannot be scheduled in the past.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;
