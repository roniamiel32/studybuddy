/**
 * File:        src/features/courses/gatekeeper-actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The server action behind "Missing a course? Add it here", used
 *              from onboarding step 2 and from the Courses tab's add-a-course
 *              panel.
 *
 *              The matching itself is local and pure — see `gatekeeper.ts`. This
 *              module is the part that touches the database: it reads the
 *              degree's catalog, hands it to the matcher, and writes the course
 *              when the matcher says there is a new one.
 *
 *              THE WRITE IS THE PART THAT NEEDS GUARDING. `authenticated` has no
 *              insert grant on `courses`, so this action is the only route by
 *              which a student can add one, and the tenancy check above it is
 *              what makes using the admin client here safe.
 *
 *              It takes plain arguments rather than FormData because it is not
 *              called from a form: both call sites already sit inside one, and
 *              nesting forms is invalid HTML.
 * Version:     0.45.0
 *
 * Modifications:
 *     0.45.0 - Added rate limiting and tracking created_by to prevent spam.
 *     0.44.0 - Rewritten as a local matcher; the LLM agent is gone.
 */

'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  comparisonKey,
  MAX_COURSE_NAME,
  runGatekeeper,
  type ExistingCourse,
  type GatekeeperReply,
} from '@/features/courses/gatekeeper';
import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient, requireUser } from '@/lib/supabase/server';

const inputSchema = z.object({
  degreeId: z.uuid('That degree does not exist.'),
  courseName: z
    .string()
    .trim()
    .min(2, 'Type the course name.')
    .max(MAX_COURSE_NAME, 'That is longer than a course name.'),
});

/**
 * A course the caller can act on.
 *
 * The whole course rather than just its offering id, because a course that has
 * just been created is in no list the client already holds — handing back an id
 * alone would have the picker select something it cannot draw.
 */
export interface MatchedCourse {
  offeringId: string;
  courseId: string;
  name: string;
}

/** What the action hands back to the UI. */
export interface GatekeeperResult extends GatekeeperReply {
  /** Set when the course exists — matched or just created — and is offered now. */
  course: MatchedCourse | null;
}

/**
 * Reads the degree's current-term catalog.
 *
 * Runs as the caller, so a degree at another university returns nothing — which
 * is the tenancy check, with nothing separate to forget.
 *
 * @param supabase - The request-scoped client.
 * @param degreeId - The degree to read.
 * @returns Its courses, with the offering each is enrolled through.
 */
async function readCatalog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  degreeId: string,
): Promise<ExistingCourse[]> {
  const { data } = await supabase
    .from('courses')
    .select('id, code, name, course_offerings(id, terms!inner(is_current))')
    .eq('degree_id', degreeId)
    .eq('course_offerings.terms.is_current', true);

  return (data ?? [])
    .map((course) => ({
      courseId: course.id,
      code: course.code,
      name: course.name,
      offeringId: course.course_offerings[0]?.id ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Builds a stable course code for a student-created course.
 *
 * Derived from the name, so adding "Computer Vision" twice produces the same
 * code and collides with itself on the unique constraint rather than creating a
 * second row. A counter or a random suffix would have made the second attempt a
 * duplicate course instead of a no-op.
 *
 * @param name - The course name.
 * @returns A code in the reserved student-created namespace.
 */
function studentCourseCode(name: string): string {
  const digest = createHash('sha256').update(comparisonKey(name)).digest('hex');
  return `UG-${digest.slice(0, 8).toUpperCase()}`;
}

/**
 * Creates a student-proposed course and makes it enrollable this term.
 *
 * Marked `is_user_generated`, and `source = 'placeholder'` because no registrar
 * and no model vouched for it — a student typed it. The course list uses both
 * facts to keep saying so.
 *
 * @param name    - The name the matcher accepted.
 * @param context - Institution, degree, term identity, and the user's ID.
 * @returns The created course, or null when it could not be created.
 */
async function createCourse(
  name: string,
  context: { universityId: string; degreeId: string; currentTermId: string; userId: string },
): Promise<MatchedCourse | null> {
  const admin = createAdminClient();
  const code = studentCourseCode(name);

  const { error } = await admin.from('courses').upsert(
    {
      university_id: context.universityId,
      degree_id: context.degreeId,
      code,
      name,
      source: 'placeholder',
      is_user_generated: true,
      // @ts-ignore
      created_by: context.userId, // <--- Saving the user who created it
    },
    /* Two students adding the same course at once must not create two rows. */
    { onConflict: 'university_id,code', ignoreDuplicates: true },
  );

  if (error) {
    console.error('[courses.gatekeeper] storing the course failed:', error.message);
    return null;
  }

  /* Re-read rather than trusting the upsert's return: with ignoreDuplicates the
     row may be one another request just created. */
  const { data: course } = await admin
    .from('courses')
    .select('id')
    .eq('university_id', context.universityId)
    .eq('code', code)
    .maybeSingle();

  if (!course) {
    return null;
  }

  await admin
    .from('course_offerings')
    .upsert(
      { course_id: course.id, term_id: context.currentTermId },
      { onConflict: 'course_id,term_id', ignoreDuplicates: true },
    );

  const { data: offering } = await admin
    .from('course_offerings')
    .select('id')
    .eq('course_id', course.id)
    .eq('term_id', context.currentTermId)
    .maybeSingle();

  return offering ? { offeringId: offering.id, courseId: course.id, name } : null;
}

/**
 * Validates a typed course name against the student's degree.
 *
 * @param input - The degree to check against, and what the student typed.
 * @returns The verdict, plus the course to enrol through when there is one.
 */
export async function checkMissingCourse(input: {
  degreeId: string;
  courseName: string;
}): Promise<ActionResult<GatekeeperResult>> {
  try {
    await requireUser();
    const supabase = await createClient();
    
   
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return fail(ERROR_CODES.UNAUTHENTICATED, 'You must be logged in.');
    }

    const { degreeId, courseName } = inputSchema.parse(input);

    /*
     * Read the degree through the CALLER'S client, so the degrees RLS policy
     * decides whether they may see it. A degree at another university is simply
     * not found.
     */
    const { data: degree } = await supabase
      .from('degrees')
      .select('id, name, university_id')
      .eq('id', degreeId)
      .maybeSingle();

    if (!degree) {
      return fail(
        ERROR_CODES.NOT_FOUND,
        'That degree is not available at your university.',
        'degreeId',
      );
    }

    const existing = await readCatalog(supabase, degreeId);
    const verdict = runGatekeeper(courseName, existing);

    if (!verdict.isValid) {
      return ok({ ...verdict, course: null });
    }

    if (!verdict.isNew) {
      const matched = existing.find(
        (course) => course.name === verdict.matchedCourseName,
      );

      /*
       * A course with no offering this term cannot be enrolled in. It is still a
       * true match, so the student is told what it matched rather than being sent
       * back to search for something they typed correctly.
       */
      if (!matched?.offeringId) {
        return ok({
          ...verdict,
          isValid: false,
          message: `${verdict.matchedCourseName} is not running this semester.`,
          course: null,
        });
      }

      return ok({
        ...verdict,
        course: {
          offeringId: matched.offeringId,
          courseId: matched.courseId,
          name: matched.name,
        },
      });
    }

   
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await supabase
      .from('courses')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', user.id)
      .gte('created_at', yesterday);

    if (count !== null && count >= 3) {
      return ok({
        ...verdict,
        isValid: false, 
        isNew: false,
        message: 'You have reached the limit of adding 3 new courses per day. Please try again tomorrow.',
        course: null,
      });
    }
    // -----------------------------------------

    const { data: term } = await supabase
      .from('terms')
      .select('id')
      .eq('is_current', true)
      .maybeSingle();

    if (!term) {
      return fail(
        ERROR_CODES.CONFLICT,
        'Your university has no active semester yet, so courses cannot be added.',
      );
    }

    const created = await createCourse(courseName.trim(), {
      universityId: degree.university_id,
      degreeId,
      currentTermId: term.id,
      userId: user.id, 
    });

    if (!created) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not add that course. Try again.');
    }

    /* The catalog changed, so any list rendered from it is now stale. */
    revalidatePath('/courses');
    revalidatePath('/onboarding/courses');

    return ok({ ...verdict, course: created });
  } catch (error) {
    return toActionError(error, 'courses.checkMissingCourse');
  }
}
import { deleteUserGeneratedCourse } from '@/features/courses/queries';

/**
 * Server action to delete a user-generated course from the UI.
 */
export async function deleteCourseAction(offeringId: string) {
  try {
    const success = await deleteUserGeneratedCourse(offeringId);
    if (success) {
      revalidatePath('/courses');
      revalidatePath('/onboarding/courses');
    }
    return success;
  } catch (error) {
    console.error('Failed to delete course:', error);
    return false;
  }
}