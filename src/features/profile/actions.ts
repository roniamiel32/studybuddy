/**
 * File:        src/features/profile/actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The write side of the Profile tab: the photo, the personal
 *              details, and the global study preferences.
 *
 *              Three actions rather than one save button. Each of the three
 *              sections on the page fails independently — an oversize photo must
 *              not discard preference edits the student made in the same visit,
 *              and a rejected city must not undo a new photo.
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - updateAvailability, for the week editor dialog
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { availabilitySchema } from '@/features/onboarding/schema';
import { snoozedPromptDate } from '@/features/profile/academic-year';
import { ALLOWED_AVATAR_TYPES, MAX_AVATAR_BYTES, uploadAvatar } from '@/features/profile/avatar';
import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { createClient, requireUser } from '@/lib/supabase/server';

/** The three buttons on the new-academic-year dialog. */
const academicYearChoiceSchema = z.enum(['yes', 'no', 'later']);

const detailsSchema = z.object({
  fullName: z.string().trim().min(2, 'Your name needs at least two characters.').max(80),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  isDiscoverable: z.boolean(),
});

/* Same enums and bounds as onboarding step 3 and the database constraints. */
const preferencesSchema = z.object({
  preferredTimeBlocks: z
    .array(z.enum(['morning', 'noon', 'evening']))
    .min(1, 'Pick at least one time of day.')
    .max(3),
  studyEnvironments: z
    .array(z.enum(['quiet', 'discussion']))
    .min(1, 'Pick at least one way of working.')
    .max(2),
  studyFormats: z
    .array(z.enum(['in_person', 'remote']))
    .min(1, 'Pick at least one way to meet.')
    .max(2),
  groupSizes: z.array(z.enum(['small', 'large'])).min(1, 'Pick at least one group size.').max(2),
  spokenLanguages: z.array(z.string().min(2).max(5)).min(1, 'Pick at least one language.'),
  studiesOnSaturday: z.boolean(),
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
 * Replaces the student's profile photo.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries the `avatar` file.
 * @returns Success, or a failure naming what was wrong with the file.
 */
export async function updateAvatar(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const file = formData.get('avatar');

    if (!(file instanceof File) || file.size === 0) {
      return fail(ERROR_CODES.VALIDATION_FAILED, 'Choose an image first.', 'avatar');
    }

    /*
     * Checked here rather than left to uploadAvatar, which returns null for both
     * "nothing to upload" and "not allowed". On this screen the student picked a
     * file deliberately, so silence would be the wrong answer — they need to know
     * it was too big or the wrong type.
     */
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      return fail(
        ERROR_CODES.VALIDATION_FAILED,
        'Photos must be JPG, PNG or WebP.',
        'avatar',
      );
    }

    if (file.size > MAX_AVATAR_BYTES) {
      return fail(ERROR_CODES.VALIDATION_FAILED, 'Photos must be under 2 MB.', 'avatar');
    }

    const avatarUrl = await uploadAvatar(supabase, user.id, file);

    if (!avatarUrl) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not upload that photo. Try again.', 'avatar');
    }

    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', user.id);

    if (error) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not save that photo. Try again.', 'avatar');
    }

    /*
     * The whole app shell, not just this page. The header badge and every match
     * card read avatar_url, so a photo that changed here has to change there in
     * the same navigation — otherwise the student sees their new photo on the
     * settings page and their old one at the top of the screen.
     */
    revalidatePath('/', 'layout');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'profile.updateAvatar');
  }
}

/**
 * Updates the student's name, city and discoverability.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `fullName`, `city` and `isDiscoverable`.
 * @returns Success, or a failure.
 */
export async function updateProfileDetails(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const input = detailsSchema.parse({
      fullName: String(formData.get('fullName') ?? ''),
      city: String(formData.get('city') ?? ''),
      isDiscoverable: formData.get('isDiscoverable') === 'on',
    });

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: input.fullName,
        city: input.city ? input.city : null,
        is_discoverable: input.isDiscoverable,
      })
      .eq('id', user.id);

    if (error) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not save your details. Try again.');
    }

    /* The name shows in the header and on every card the student appears on. */
    revalidatePath('/', 'layout');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'profile.updateProfileDetails');
  }
}

/**
 * Updates the global study preferences.
 *
 * These are the defaults every course inherits. A course with its own override
 * keeps it — deliberately: the student set that override precisely because the
 * course is different, and silently overwriting it would undo a decision they
 * made on purpose. The Courses grid marks which courses carry one.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries the five multi-selects and the Saturday answer.
 * @returns Success, or a failure.
 */
export async function updateGlobalPreferences(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const input = preferencesSchema.parse({
      preferredTimeBlocks: multi(formData, 'preferredTimeBlocks'),
      studyEnvironments: multi(formData, 'studyEnvironments'),
      studyFormats: multi(formData, 'studyFormats'),
      groupSizes: multi(formData, 'groupSizes'),
      spokenLanguages: multi(formData, 'spokenLanguages'),
      studiesOnSaturday: formData.get('studiesOnSaturday') === 'yes',
    });

    /* Upsert, so a student who somehow reaches this page without a preferences
       row gets one rather than a silent no-op. */
    const { error } = await supabase.from('learning_preferences').upsert(
      {
        profile_id: user.id,
        preferred_time_blocks: input.preferredTimeBlocks as never,
        study_environments: input.studyEnvironments as never,
        study_formats: input.studyFormats as never,
        group_sizes: input.groupSizes as never,
        spoken_languages: input.spokenLanguages,
        studies_on_saturday: input.studiesOnSaturday,
      },
      { onConflict: 'profile_id' },
    );

    if (error) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not save your preferences. Try again.');
    }

    /* Preferences decide the ranking, so the matches screen is now stale. */
    revalidatePath('/settings');
    revalidatePath('/dashboard');
    revalidatePath('/courses');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'profile.updateGlobalPreferences');
  }
}

/**
 * Replaces the student's hand-drawn week.
 *
 * The same write as onboarding step 4, minus the two things that only make
 * sense the first time through: it does not stamp `onboarding_completed_at`,
 * and it does not redirect. A student editing their week from the Profile tab
 * is already set up and expects to stay where they are.
 *
 * Only `manual` rows are replaced. Slots synced from a calendar belong to the
 * integration, and the uniqueness constraint keys on `source` precisely so this
 * delete cannot reach them (decision D7).
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries one `slots` entry per selected block.
 * @returns Success, or a failure.
 */
export async function updateAvailability(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const input = availabilitySchema.parse({
      slots: multi(formData, 'slots').map((raw) => {
        const [dayOfWeek, startsAt, endsAt] = raw.split('|');
        return { dayOfWeek, startsAt, endsAt };
      }),
    });

    const { error: clearError } = await supabase
      .from('availability_slots')
      .delete()
      .eq('profile_id', user.id)
      .eq('source', 'manual');

    if (clearError) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not save your week. Try again.');
    }

    /* An empty week is a legitimate answer — the student cleared it. Skipping
       the insert is the whole difference, not an early return. */
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
        return fail(ERROR_CODES.UNEXPECTED, 'We could not save your week. Try again.');
      }
    }

    /* Overlapping hours are the largest single part of a match score, so every
       screen that ranks anyone is now stale. */
    revalidatePath('/settings');
    revalidatePath('/dashboard');
    revalidatePath('/courses');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'profile.updateAvailability');
  }
}

/**
 * Removes the student's profile photo.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @returns Success, or a failure.
 */
export async function removeAvatar(
  previous: ActionResult<void> | null,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    /* 
     * Setting avatar_url to null in the database removes the photo 
     * across the entire application shell.
     */
    const { error } = await supabase
      .from('profiles')
      .update({ avatar_url: null })
      .eq('id', user.id);

    if (error) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not remove that photo. Try again.');
    }

    revalidatePath('/', 'layout');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'profile.removeAvatar');
  }
}

/**
 * Records the student's answer to "have you moved up a year?".
 *
 * THREE ANSWERS, ONE COLUMN. "Yes" and "no" both settle the question for this
 * academic year and differ only in whether the year moves; "later" settles
 * nothing and writes a date the six-month rule reopens in a week. Which date
 * that is belongs in academic-year.ts next to the rule it has to satisfy.
 *
 * THE YEAR IS READ AND WRITTEN IN ONE STATEMENT rather than read, incremented in
 * JavaScript and written back. Two page loads answering "yes" at once would both
 * read the same year and both write the same successor, and the student would
 * advance once for two answers — or, worse, a stale read would move them
 * backwards. `year_of_study + 1` lets the database do the arithmetic on the row
 * it is holding.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `choice`: yes, no, or later.
 * @returns Success, or a failure.
 */
export async function answerAcademicYearPrompt(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const choice = academicYearChoiceSchema.parse(formData.get('choice'));

    const promptedAt =
      choice === 'later' ? snoozedPromptDate() : new Date();

    if (choice === 'yes') {
      const { error: advanceError } = await supabase.rpc('rpc_advance_academic_year');

      if (advanceError) {
        return fail(
          ERROR_CODES.UNEXPECTED,
          'We could not update your year. Try again from your profile settings.',
        );
      }

      /*
       * A null result means the year was unset or already at the maximum, so
       * there was nothing to advance. Not an error: the prompt date below still
       * needs writing, or the student is asked the same unanswerable question on
       * every page load. shouldPromptForAcademicYear keeps them from being asked
       * at all; this is what happens if it ever fails to.
       */
    }

    const { error } = await supabase
      .from('profiles')
      .update({ last_year_prompt_date: promptedAt.toISOString() })
      .eq('id', user.id);

    if (error) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not save that. Try again.');
    }

    /* The year shows in the header profile card and on every card the student
       appears on, so the whole shell is stale until this is revalidated. */
    revalidatePath('/', 'layout');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'profile.answerAcademicYearPrompt');
  }
}