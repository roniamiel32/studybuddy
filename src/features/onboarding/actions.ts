/**
 * File:        src/features/onboarding/actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The write side of onboarding, one action per step. Each
 *              validates its input, writes as the signed-in student so RLS
 *              applies, and moves them to the next step.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - Avatar upload moved to features/profile/avatar.ts
 *     0.10.0 - 2026-08-09 - Per-degree course requirement; DOB and city
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { uploadAvatar } from '@/features/profile/avatar';
import { standDownCalendarSync } from '@/features/calendar/connection';
import { ERROR_CODES, fail, toActionError, type ActionResult } from '@/lib/errors';
import { createClient, requireUser } from '@/lib/supabase/server';

import {
  availabilitySchema,
  basicsSchema,
  coursesSchema,
  preferencesSchema,
} from './schema';

/**
 * Reads a repeated form field as an array.
 *
 * @param formData - The submitted form.
 * @param name     - The field name, repeated once per selected value.
 * @returns The selected values as strings.
 */
function multi(formData: FormData, name: string): string[] {
  return formData.getAll(name).map(String).filter(Boolean);
}

/**
 * Counts current-term offerings for the caller's own DEGREE.
 *
 * Scoped to the degree, not the university. Counting university-wide would force
 * a Law student to pick a course because Computer Science has a catalog — the
 * same confusion of scopes behind the course-filtering bug.
 *
 * @param supabase - The request-scoped client.
 * @param userId   - The caller, whose degree defines the scope.
 * @returns The number of offerings on their degree this term.
 */
async function degreeOfferingCount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<number> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('degree_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.degree_id) {
    return 0;
  }

  const { count } = await supabase
    .from('course_offerings')
    .select('id, terms!inner(is_current), courses!inner(degree_id)', {
      count: 'exact',
      head: true,
    })
    .eq('courses.degree_id', profile.degree_id)
    .eq('terms.is_current', true);

  return count ?? 0;
}

/**
 * Step 1 — academic and personal profile.
 *
 * @param _previous - Previous form state.
 * @param formData  - The submitted form.
 * @returns A failed result, or redirects to step 2.
 */
export async function saveBasics(
  _previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const input = basicsSchema.parse({
      fullName: formData.get('fullName'),
      degreeId: formData.get('degreeId'),
      yearOfStudy: formData.get('yearOfStudy'),
      city: formData.get('city'),
      dateOfBirth: formData.get('dateOfBirth'),
    });

    const supabase = await createClient();

    const avatarFile = formData.get('avatar');
    const avatarUrl = await uploadAvatar(
      supabase,
      user.id,
      avatarFile instanceof File ? avatarFile : null,
    );

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: input.fullName,
        degree_id: input.degreeId,
        year_of_study: input.yearOfStudy,
        city: input.city,
        /*
         * Only overwritten when a new photo was actually uploaded. Spreading
         * conditionally keeps an existing avatar when the student edits their
         * name and leaves the file input alone.
         */
        ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
      })
      .eq('id', user.id);

    if (error) {
      /*
       * The most likely cause is a same-university trigger rejecting a degree or
       * track from another institution, which only happens if the form was
       * tampered with. Report it as a field error rather than a crash.
       */
      return fail(
        ERROR_CODES.VALIDATION_FAILED,
        'That degree is not offered at your university.',
        'degreeId',
      );
    }

    /*
     * Date of birth goes to the private table, and only when given. Upserted so
     * a student revisiting step 1 can correct it.
     */
    if (input.dateOfBirth) {
      const { error: dobError } = await supabase
        .from('profile_private')
        .upsert(
          { profile_id: user.id, date_of_birth: input.dateOfBirth },
          { onConflict: 'profile_id' },
        );

      if (dobError) {
        return fail(
          ERROR_CODES.VALIDATION_FAILED,
          'That date of birth was not accepted.',
          'dateOfBirth',
        );
      }
    }
  } catch (error) {
    return toActionError(error, 'onboarding.saveBasics');
  }

  revalidatePath('/onboarding', 'layout');
  redirect('/onboarding/courses');
}

/**
 * Step 2 — course selection.
 *
 * Replaces the whole selection rather than diffing it: the picker submits the
 * complete set, so a delete-then-insert is both simpler and correct, and it
 * cannot leave a course behind that the student unticked.
 *
 * @param _previous - Previous form state.
 * @param formData  - The submitted form.
 * @returns A failed result, or redirects to step 3.
 */
export async function saveCourses(
  _previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const selected = multi(formData, 'offeringIds');

    /*
     * Requiring a course is right whenever there are courses to require. It is
     * not right for the first student at an institution whose catalog has not
     * been loaded yet — for them the rule would be a dead end, not a guardrail.
     */
    if (selected.length === 0 && (await degreeOfferingCount(supabase, user.id)) > 0) {
      return fail(
        ERROR_CODES.VALIDATION_FAILED,
        'Pick at least one course so we have something to match you on.',
        'offeringIds',
      );
    }

    const input = coursesSchema.parse({ offeringIds: selected });

    const { error: clearError } = await supabase
      .from('enrollments')
      .delete()
      .eq('profile_id', user.id);
    if (clearError) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not update your courses. Try again.');
    }

    const { error } = await supabase.from('enrollments').insert(
      input.offeringIds.map((offeringId) => ({
        profile_id: user.id,
        course_offering_id: offeringId,
        /*
         * Sent to satisfy the type, then overwritten by the
         * set_enrollment_university trigger from the offering itself. The RLS
         * policy checks the derived value, so a course from another
         * institution is refused here no matter what this says.
         */
        university_id: '00000000-0000-0000-0000-000000000000',
      })),
    );

    if (error) {
      return fail(
        ERROR_CODES.FORBIDDEN,
        'One of those courses is not available at your university.',
        'offeringIds',
      );
    }
  } catch (error) {
    return toActionError(error, 'onboarding.saveCourses');
  }

  revalidatePath('/onboarding', 'layout');
  redirect('/onboarding/preferences');
}

/**
 * Step 3 — default study preferences.
 *
 * These are defaults for the whole profile. Per-course overrides are a planned
 * extension, which is why the row is keyed on the profile alone.
 *
 * @param _previous - Previous form state.
 * @param formData  - The submitted form.
 * @returns A failed result, or redirects to step 4.
 */
export async function savePreferences(
  _previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const input = preferencesSchema.parse({
      preferredTimeBlocks: multi(formData, 'preferredTimeBlocks'),
      studyEnvironments: multi(formData, 'studyEnvironments'),
      groupSizes: multi(formData, 'groupSizes'),
      studiesOnSaturday: formData.get('studiesOnSaturday') === 'yes',
      studyFormats: multi(formData, 'studyFormats'),
      spokenLanguages: multi(formData, 'spokenLanguages'),
    });

    const supabase = await createClient();
    const { error } = await supabase.from('learning_preferences').upsert(
      {
        profile_id: user.id,
        preferred_time_blocks: input.preferredTimeBlocks,
        study_environments: input.studyEnvironments,
        group_sizes: input.groupSizes,
        studies_on_saturday: input.studiesOnSaturday,
        study_formats: input.studyFormats,
        spoken_languages: input.spokenLanguages,
      },
      { onConflict: 'profile_id' },
    );

    if (error) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not save your preferences. Try again.');
    }
  } catch (error) {
    return toActionError(error, 'onboarding.savePreferences');
  }

  revalidatePath('/onboarding', 'layout');
  redirect('/onboarding/availability');
}

/**
 * Step 4 — availability, then finish.
 *
 * Only rows the student authored by hand are replaced. Slots synced from a
 * calendar are left alone, which is the whole reason `source` is part of the
 * uniqueness constraint (decision D7).
 *
 * Completion is stamped here rather than in a separate action so that a student
 * cannot end up marked complete with a half-saved grid.
 *
 * @param _previous - Previous form state.
 * @param formData  - The submitted form.
 * @returns A failed result, or redirects to the dashboard.
 */
export async function saveAvailabilityAndFinish(
  _previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();

    const input = availabilitySchema.parse({
      slots: multi(formData, 'slots').map((raw) => {
        const [dayOfWeek, startsAt, endsAt] = raw.split('|');
        return { dayOfWeek, startsAt, endsAt };
      }),
    });

    const supabase = await createClient();

    // Guard the prerequisites rather than trusting navigation order: a student
    // can always type a URL, and being marked complete without courses would
    // leave them on a dashboard that can never show anything.
    const { count: enrolledCount } = await supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', user.id);

    const { data: preferences } = await supabase
      .from('learning_preferences')
      .select('profile_id')
      .eq('profile_id', user.id)
      .maybeSingle();

    if (!enrolledCount && (await degreeOfferingCount(supabase, user.id)) > 0) {
      return fail(
        ERROR_CODES.ONBOARDING_INCOMPLETE,
        'Pick at least one course before finishing.',
      );
    }

    if (!preferences) {
      return fail(
        ERROR_CODES.ONBOARDING_INCOMPLETE,
        'Answer the study preference questions before finishing.',
      );
    }

    /*
     * A hand-drawn week and a synced one must never coexist — see
     * standDownCalendarSync for why the arithmetic breaks if they do. Saving the
     * grid is an explicit choice to own the week, so calendar rows go first.
     */
    await standDownCalendarSync(user.id);

    const { error: clearError } = await supabase
      .from('availability_slots')
      .delete()
      .eq('profile_id', user.id)
      .eq('source', 'manual');
    if (clearError) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not save your availability. Try again.');
    }

    if (input.slots.length > 0) {
      const { error } = await supabase.from('availability_slots').insert(
        input.slots.map((slot) => ({
          profile_id: user.id,
          day_of_week: slot.dayOfWeek,
          starts_at: slot.startsAt,
          ends_at: slot.endsAt,
          source: 'manual' as const,
        })),
      );

      if (error) {
        return fail(ERROR_CODES.UNEXPECTED, 'We could not save your availability. Try again.');
      }
    }

    const { error: completeError } = await supabase
      .from('profiles')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', user.id);

    if (completeError) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not finish setting up your account.');
    }
  } catch (error) {
    return toActionError(error, 'onboarding.saveAvailabilityAndFinish');
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
