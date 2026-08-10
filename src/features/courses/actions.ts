/**
 * File:        src/features/courses/actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The write side of the Courses tab: joining a course, dropping one,
 *              and setting or clearing a per-course preference override.
 *
 *              Every write runs as the signed-in student, so the enrolment
 *              policies do the authorisation — they already scope insert, update
 *              and delete to the owner's own rows, which is why per-course
 *              overrides needed no new policy when they landed on this table.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { createClient, requireUser } from '@/lib/supabase/server';

import { normaliseOverride, type CoursePreferenceValues } from './course-view';

const offeringSchema = z.object({ offeringId: z.uuid('That course does not exist.') });

/*
 * Mirrors the enum values and the database CHECK constraints. At least one answer
 * per question, because an empty array is not "no preference" — null is.
 */
const overrideSchema = z.object({
  offeringId: z.uuid(),
  preferredTimeBlocks: z.array(z.enum(['morning', 'noon', 'evening'])).min(1).max(3),
  studyEnvironments: z.array(z.enum(['quiet', 'discussion'])).min(1).max(2),
  studyFormats: z.array(z.enum(['in_person', 'remote'])).min(1).max(2),
  groupSizes: z.array(z.enum(['small', 'large'])).min(1).max(2),
});

/**
 * Reads a repeated form field as an array.
 *
 * @param formData - The submitted form.
 * @param name     - The field name, repeated once per selected value.
 * @returns The selected values.
 */
function multi(formData: FormData, name: string): string[] {
  return formData.getAll(name).map(String).filter(Boolean);
}

/**
 * Enrols the student in a course.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `offeringId`.
 * @returns Success, or a failure the form can display.
 */
export async function joinCourse(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const { offeringId } = offeringSchema.parse({
      offeringId: String(formData.get('offeringId') ?? ''),
    });

    const { error } = await supabase.from('enrollments').insert({
      profile_id: user.id,
      course_offering_id: offeringId,
      /*
       * Overwritten by the set_enrollment_university trigger from the offering
       * itself, and the RLS policy checks the derived value — so a course from
       * another institution is refused whatever this says.
       */
      university_id: '00000000-0000-0000-0000-000000000000',
    });

    if (error) {
      /* The unique constraint is the likely cause, and it is not an error worth
         alarming anyone about: they are already in the course. */
      return error.code === '23505'
        ? ok(undefined)
        : fail(
            ERROR_CODES.FORBIDDEN,
            'We could not add that course. It may not be available at your university.',
            'offeringId',
          );
    }
  } catch (error) {
    return toActionError(error, 'courses.joinCourse');
  }

  revalidatePath('/courses');
  revalidatePath('/dashboard');

  return ok(undefined);
}

/**
 * Removes a course the student is no longer taking.
 *
 * The enrolment row is deleted rather than flagged. Everything hanging off it —
 * the per-course override, the matches for that course — is meaningless once they
 * have dropped it, and `on delete cascade` clears the rest.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `offeringId`.
 * @returns Success, or a failure.
 */
export async function dropCourse(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const { offeringId } = offeringSchema.parse({
      offeringId: String(formData.get('offeringId') ?? ''),
    });

    /*
     * The last course cannot be dropped from here.
     *
     * Matching is anchored to a shared course, so a student with none is
     * unmatchable — the same rule step 2 of onboarding enforces. Leaving them one
     * course is the difference between editing their list and quietly opting out
     * of the product.
     */
    const { count } = await supabase
      .from('enrollments')
      .select('course_offering_id', { count: 'exact', head: true })
      .eq('profile_id', user.id);

    if ((count ?? 0) <= 1) {
      return fail(
        ERROR_CODES.VALIDATION_FAILED,
        'Add another course before dropping this one — we match you on the courses you share.',
        'offeringId',
      );
    }

    const { error } = await supabase
      .from('enrollments')
      .delete()
      .eq('profile_id', user.id)
      .eq('course_offering_id', offeringId);

    if (error) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not remove that course. Try again.');
    }
  } catch (error) {
    return toActionError(error, 'courses.dropCourse');
  }

  revalidatePath('/courses');
  revalidatePath('/dashboard');

  return ok(undefined);
}

/**
 * Saves a per-course preference override.
 *
 * A field matching the global answer is stored as NULL rather than as a copy.
 * Otherwise a later change to the global preference would silently skip courses
 * the student had "customised" to the value they were already using — they would
 * have to revisit each one to find out why.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `offeringId` and the four multi-selects.
 * @returns Success, or a failure the modal can display.
 */
export async function saveCoursePreferences(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const input = overrideSchema.parse({
      offeringId: String(formData.get('offeringId') ?? ''),
      preferredTimeBlocks: multi(formData, 'preferredTimeBlocks'),
      studyEnvironments: multi(formData, 'studyEnvironments'),
      studyFormats: multi(formData, 'studyFormats'),
      groupSizes: multi(formData, 'groupSizes'),
    });

    const { data: globals } = await supabase
      .from('learning_preferences')
      .select('preferred_time_blocks, study_environments, study_formats, group_sizes')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!globals) {
      return fail(
        ERROR_CODES.ONBOARDING_INCOMPLETE,
        'Set your study preferences first, then you can change them per course.',
      );
    }

    const override = normaliseOverride(
      {
        preferredTimeBlocks: globals.preferred_time_blocks,
        studyEnvironments: globals.study_environments,
        studyFormats: globals.study_formats,
        groupSizes: globals.group_sizes,
      },
      input satisfies CoursePreferenceValues,
    );

    const { error } = await supabase
      .from('enrollments')
      .update({
        preferred_time_blocks: override.preferredTimeBlocks as never,
        study_environments: override.studyEnvironments as never,
        study_formats: override.studyFormats as never,
        group_sizes: override.groupSizes as never,
      })
      .eq('profile_id', user.id)
      .eq('course_offering_id', input.offeringId);

    if (error) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not save those preferences. Try again.');
    }

    revalidatePath(`/courses/${input.offeringId}`);
    revalidatePath('/courses');
    revalidatePath('/dashboard');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'courses.saveCoursePreferences');
  }
}

/**
 * Clears a per-course override, returning the course to the global answer.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `offeringId`.
 * @returns Success, or a failure.
 */
export async function clearCoursePreferences(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const { offeringId } = offeringSchema.parse({
      offeringId: String(formData.get('offeringId') ?? ''),
    });

    const { error } = await supabase
      .from('enrollments')
      .update({
        preferred_time_blocks: null,
        study_environments: null,
        study_formats: null,
        group_sizes: null,
      })
      .eq('profile_id', user.id)
      .eq('course_offering_id', offeringId);

    if (error) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not reset those preferences. Try again.');
    }

    revalidatePath(`/courses/${offeringId}`);
    revalidatePath('/courses');
    revalidatePath('/dashboard');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'courses.clearCoursePreferences');
  }
}
