/**
 * File:        src/features/matching/queries.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Reads for the matching screens. The scoring lives in SQL
 *              (`rpc_find_candidates`); this layer only shapes the result for
 *              display.
 * Version:     0.48.0
 *
 * Modifications:
 *     0.48.0 - 2026-08-19 - Shared courses are named, not coded
 *     0.10.0 - 2026-08-09 - Matching v2 columns; track_name dropped
 *     0.8.0 - 2026-08-05 - Initial implementation (Phase 2)
 */

import 'server-only';

import { createClient } from '@/lib/supabase/server';

import type { MatchView } from './match-view';

/**
 * Ranked candidates for the caller.
 *
 * The RPC returns one row per shared course, because a course dashboard needs
 * exactly that. The cross-course view needs one row per PERSON, so rows are
 * folded here: each candidate keeps their highest-scoring course and collects
 * every course they share. Doing it in TypeScript rather than SQL keeps the
 * scoring function single-purpose.
 *
 * @param options - `courseOfferingId` narrows to one course; `limit` caps the
 *                  number of people returned.
 * @returns Candidates, best first.
 */
export async function getMatches(options?: {
  courseOfferingId?: string;
  limit?: number;
}): Promise<MatchView[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('rpc_find_candidates', {
    p_course_offering_id: options?.courseOfferingId ?? undefined,
    /* Generous: rows are per shared course, so a handful of people can be many
       rows, and folding happens after. */
    p_limit: 200,
  });

  if (error || !data) {
    return [];
  }

  const byCandidate = new Map<string, MatchView>();

  for (const row of data) {
    const existing = byCandidate.get(row.candidate_id);

    if (existing) {
      if (!existing.sharedCourseNames.includes(row.course_name)) {
        existing.sharedCourseNames.push(row.course_name);
      }
      /* Rows arrive score-ordered, so the first one seen is already the best. */
      continue;
    }

    byCandidate.set(row.candidate_id, {
      candidateId: row.candidate_id,
      fullName: row.full_name ?? 'A classmate',
      avatarUrl: row.avatar_url,
      degreeName: row.degree_name,
      yearOfStudy: row.year_of_study,
      score: Number(row.rule_score),
      overlapMinutes: row.overlap_minutes,
      sharedDays: row.shared_days ?? [],
      sharedCourseNames: [row.course_name],
      bestCourseName: row.course_name,
      bestCourseOfferingId: row.course_offering_id,
      preferredTimeBlocks: row.preferred_time_blocks ?? [],
      studyEnvironments: row.study_environments ?? [],
      groupSizes: row.group_sizes ?? [],
      studiesOnSaturday: row.studies_on_saturday,
      intent: row.intent,
    });
  }

  return [...byCandidate.values()].slice(0, options?.limit ?? 24);
}
