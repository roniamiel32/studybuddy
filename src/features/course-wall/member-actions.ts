/**
 * File:        src/features/course-wall/member-actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Paging the study-members widget.
 *
 *              ITS OWN FILE, and not a sixth export from actions.ts, because it
 *              is the only action here that READS. Everything in actions.ts
 *              writes something and then revalidates a page; this fetches the
 *              next handful of classmates and hands them back to a component
 *              that appends them without a navigation. Filing a read among the
 *              writes is how somebody later adds a revalidatePath to it and
 *              wonders why pressing "Load more" refreshes the wall.
 * Version:     0.25.0
 *
 * Modifications:
 *     0.25.0 - 2026-08-13 - Initial implementation (Phase 9C)
 */

'use server';

import { z } from 'zod';

import { getCourseMembers } from '@/features/course-wall/queries';
import { toActionError, ok, type ActionResult } from '@/lib/errors';
import type { CourseMemberView } from '@/features/course-wall/course-wall-view';

const pageSchema = z.object({
  offeringId: z.uuid('That course does not look right.'),
  offset: z.number().int().min(0).max(2000),
  /* Bounded so a forged call cannot ask for the whole university in one go. */
  limit: z.number().int().min(1).max(24),
});

/**
 * The next page of students taking a course.
 *
 * Enrolment is enforced by RLS on `enrollments`, so a caller who is not in the
 * course gets an empty page rather than a refusal — which is the same thing they
 * would see if the course were empty, and tells them nothing either way.
 *
 * @param input - The course, and where to continue from.
 * @returns The next members, and whether more remain.
 */
export async function loadMoreCourseMembers(input: {
  offeringId: string;
  offset: number;
  limit: number;
}): Promise<ActionResult<{ members: CourseMemberView[]; hasMore: boolean }>> {
  try {
    const parsed = pageSchema.parse(input);

    const page = await getCourseMembers(parsed.offeringId, parsed.limit, parsed.offset);

    return ok(page);
  } catch (error) {
    return toActionError(error, 'courseWall.loadMoreCourseMembers');
  }
}
