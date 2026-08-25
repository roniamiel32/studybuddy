-- =============================================================================
-- File:        supabase/migrations/20260817180000_course_group_scores.sql
-- Authors:     Roni Amiel & Eden Bitran
-- Description: The same group fit, answered for a whole course at once — so a
--              student browsing groups sees it before they ask to join.
--
--              THE SCORE ITSELF IS UNCHANGED. This calls
--              rpc_group_candidate_score, which is the point: the number a
--              student weighs before asking has to be the number the founder
--              weighs before answering, or the two of them are looking at
--              different things while making the same decision.
--
--              ONE CALL FOR THE LIST, not one per card. A course page renders
--              every group in the course, and each score already costs an
--              intersection across the members plus a trait comparison per
--              member — doing that as N round trips would be the slowest thing
--              on the page.
--
--              GROUPS THE CALLER IS ALREADY IN ARE EXCLUDED, and not for
--              tidiness. The score measures a candidate against the hours the
--              members share, and a member is part of what makes those hours: a
--              number computed for somebody already inside the intersection is
--              measuring them against a week they themselves helped define. It
--              would read high for everyone and mean nothing. There is also
--              nothing to decide — they are in.
--
--              THE ENROLMENT CHECK IS UP FRONT rather than a WHERE clause beside
--              the function call. rpc_group_candidate_score raises for a group
--              the caller cannot see, and the planner is free to evaluate a
--              SELECT-list function before a WHERE predicate — so relying on the
--              filter to keep it from firing would work until it did not.
-- Version:     0.41.0
--
-- Modifications:
--     0.41.0 - 2026-08-17 - Initial implementation (Phase 11C)
-- =============================================================================

create or replace function public.rpc_course_group_scores(p_course_offering_id uuid)
returns table (group_id uuid, score numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.enrollments e
    where e.profile_id = auth.uid()
      and e.course_offering_id = p_course_offering_id
  ) then
    raise exception 'That course is not yours to read.'
      using errcode = '42501';
  end if;

  return query
  select g.id, public.rpc_group_candidate_score(g.id, auth.uid())
  from public.study_groups g
  where g.course_offering_id = p_course_offering_id
    and not public.app_is_group_member(g.id);
end;
$$;

comment on function public.rpc_course_group_scores is
  'How well the caller fits each group in one of their courses, 0-100, using the same blend the founder sees on a join request. Skips groups they are already in, where the score would be measuring them against a week they helped define.';

revoke execute on function public.rpc_course_group_scores(uuid) from public;
grant execute on function public.rpc_course_group_scores(uuid) to authenticated;
