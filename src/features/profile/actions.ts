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
import { ALLOWED_AVATAR_TYPES, MAX_AVATAR_BYTES, uploadAvatar } from '@/features/profile/avatar';
import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { createClient, requireUser } from '@/lib/supabase/server';

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
