-- =============================================================================
-- File:        supabase/migrations/20260812140000_authorship_survives_deletion.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: A student who wrote on a wall can delete their account.
--
--              THE FOURTH TIME THIS EXACT SHAPE HAS APPEARED, so it is written
--              down here as a rule rather than fixed quietly again:
--
--                A column with `on delete set null` turns account deletion into
--                an UPDATE on another table. Any freeze trigger there will see
--                that update and, if it guards the column being nulled, refuse
--                it — taking the account deletion down with it.
--
--              Previously: freeze_study_group (admin_id), freeze_notification
--              (actor_id), check_meeting_consistency (created_by). Now the two
--              wall triggers, which guard author_id for the right reason —
--              nobody may reattribute someone else's words — but did not allow
--              the one transition the foreign key itself performs.
--
--              THE RULE THAT KEEPS BOTH PROPERTIES: authorship may be LOST, never
--              MOVED. X to NULL is the cascade and is allowed; X to Y is a
--              reattribution and stays refused.
-- Version:     0.22.0
--
-- Modifications:
--     0.22.0 - 2026-08-12 - Authorship may be lost, never moved
-- =============================================================================

create or replace function public.touch_wall_post()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.profile_owner_id is distinct from old.profile_owner_id then
    raise exception 'A post cannot be moved to another wall.'
      using errcode = '42501';
  end if;

  -- Lost, never moved: the null is the cascade from a deleted account.
  if new.author_id is distinct from old.author_id and new.author_id is not null then
    raise exception 'A post cannot be reattributed to another author.'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  new.created_at := old.created_at;

  return new;
end;
$$;

create or replace function public.touch_post_comment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.post_id is distinct from old.post_id then
    raise exception 'A comment cannot be moved to another post.'
      using errcode = '42501';
  end if;

  if new.author_id is distinct from old.author_id and new.author_id is not null then
    raise exception 'A comment cannot be reattributed to another author.'
      using errcode = '42501';
  end if;

  new.updated_at := now();
  new.created_at := old.created_at;

  return new;
end;
$$;
