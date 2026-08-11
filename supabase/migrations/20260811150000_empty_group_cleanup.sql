-- =============================================================================
-- File:        supabase/migrations/20260811150000_empty_group_cleanup.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: A group with nobody in it stops existing.
--
--              THE STATE PHASE 7A MADE REACHABLE. While admin_id was
--              `on delete cascade`, losing the founder took the group with it, so
--              an empty group was not a thing that could persist. Multi-admin
--              required `set null` — a group of six must not vanish because one
--              person closed their account — and the price is a row that can now
--              outlive everyone in it.
--
--              An empty group is not dormant, it is DEAD: joining needs an admin
--              to approve, and there is nobody left to be one. It would sit in
--              the course's "Study groups" list advertising a Request to join
--              button that can never be answered.
--
--              Found the honest way: after Phase 7A the e2e suites left 23 of
--              these behind, and one of them was matched by a test looking for
--              the group it thought it had just created.
-- Version:     0.19.0
--
-- Modifications:
--     0.19.0 - 2026-08-11 - Initial implementation
-- =============================================================================

-- AFTER, and STATEMENT-level would be wrong here: the count has to be taken per
-- group, once the row is gone.
create or replace function public.delete_group_when_empty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.study_group_members m
    where m.group_id = old.group_id
  ) then
    delete from public.study_groups g where g.id = old.group_id;
  end if;

  return old;
end;
$$;

comment on function public.delete_group_when_empty is
  'Removes a group once its last member is gone. Reachable since admin_id became nullable: without it, a group nobody can join or administer stays in the course listing forever.';

-- Fires after ensure_group_keeps_an_admin, which is alphabetically earlier and
-- has first refusal: a deliberate departure that would strand the group is
-- refused there, and only a genuinely empty group reaches this.
create trigger study_group_members_delete_empty_group
  after delete on public.study_group_members
  for each row execute function public.delete_group_when_empty();

-- The groups already stranded, from before the trigger existed.
delete from public.study_groups g
where not exists (
  select 1 from public.study_group_members m where m.group_id = g.id
);
