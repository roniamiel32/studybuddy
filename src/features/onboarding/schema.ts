/**
 * File:        src/features/onboarding/schema.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Validation for each onboarding step. These are the server's
 *              rules — the forms mirror them for fast feedback, but nothing is
 *              trusted until it has been through here.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import { z } from 'zod';

/** Step 1. The university is deliberately absent: it comes from the email domain. */
export const basicsSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Enter your name as your classmates would recognise it.')
    .max(80, 'That name is too long.'),
  studyTrackId: z.uuid('Choose your study track.'),
  yearOfStudy: z.coerce
    .number()
    .int()
    .min(1, 'Choose your year of study.')
    .max(8, 'Choose a year between 1 and 8.'),
});

/**
 * Step 2. At least one course, because a student with none has nothing to be
 * matched on — every match in this product is anchored to a shared course.
 */
export const coursesSchema = z.object({
  offeringIds: z
    .array(z.uuid())
    .min(1, 'Pick at least one course so we have something to match you on.')
    .max(12, 'Twelve courses is the most we can match on at once.')
    /* Two identical ids would violate the unique constraint on enrollments. */
    .transform((ids) => [...new Set(ids)]),
});

/** Step 3. Three multi-selects and one yes/no, exactly as specified. */
export const preferencesSchema = z.object({
  preferredTimeBlocks: z
    .array(z.enum(['morning', 'noon', 'evening', 'other']))
    .min(1, 'Choose at least one time of day.')
    .transform((values) => [...new Set(values)]),
  studyEnvironments: z
    .array(z.enum(['discussion', 'quiet']))
    .min(1, 'Choose at least one study environment.')
    .transform((values) => [...new Set(values)]),
  groupSizes: z
    .array(z.enum(['small', 'large']))
    .min(1, 'Choose at least one group size.')
    .transform((values) => [...new Set(values)]),
  studiesOnSaturday: z.boolean(),
  spokenLanguages: z
    .array(z.string().min(2).max(8))
    .min(1, 'Choose at least one language.')
    .max(5, 'Five languages is the maximum.')
    .transform((values) => [...new Set(values)]),
});

/**
 * Step 4. An empty grid is allowed — availability can be filled in later, and
 * blocking completion on it would strand students who do not yet know their
 * timetable. Matching simply scores them lower until they do.
 */
export const availabilitySchema = z.object({
  slots: z
    .array(
      z.object({
        dayOfWeek: z.coerce.number().int().min(0).max(6),
        startsAt: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time.'),
        endsAt: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid time.'),
      }),
    )
    .max(7 * 12, 'That is more slots than the grid can produce.')
    .refine(
      (slots) => slots.every((slot) => slot.endsAt > slot.startsAt),
      'A slot cannot end before it starts.',
    ),
});

export type BasicsInput = z.infer<typeof basicsSchema>;
export type CoursesInput = z.infer<typeof coursesSchema>;
export type PreferencesInput = z.infer<typeof preferencesSchema>;
export type AvailabilityInput = z.infer<typeof availabilitySchema>;
