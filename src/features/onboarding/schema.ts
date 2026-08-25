/**
 * File:        src/features/onboarding/schema.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Validation for each onboarding step. These are the server's
 *              rules — the forms mirror them for fast feedback, but nothing is
 *              trusted until it has been through here.
 * Version:     0.10.0
 *
 * Modifications:
 *     0.10.0 - 2026-08-09 - studyTrackId removed; city, DOB, study formats
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import { z } from 'zod';

/**
 * Step 1 — academic and personal profile.
 *
 * The university is deliberately absent. It is derived from the email domain at
 * signup and shown read-only, because it is the tenant key: letting a student
 * choose an institution their address does not belong to would break the
 * isolation every other rule depends on.
 *
 * `degreeLevel` is also absent as a stored value — it is a property of the
 * degree, so it filters the degree list rather than being saved twice.
 */
export const basicsSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Enter your name as your classmates would recognise it.')
    .max(80, 'That name is too long.'),
  degreeId: z.uuid('Choose your degree.'),
  yearOfStudy: z.coerce
    .number()
    .int()
    .min(1, 'Choose your year of study.')
    .max(8, 'Choose a year between 1 and 8.'),
  city: z
    .string()
    .trim()
    .min(2, 'Enter the city you usually study in.')
    .max(80, 'That city name is too long.'),
  /*
   * Optional. It only feeds the age-gap bonus, and requiring a date of birth to
   * use the product would be a poor trade for one scoring term.
   */
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker.')
    .optional()
    .or(z.literal('').transform(() => undefined))
    .refine((value) => {
      if (!value) return true;
      const age = (Date.now() - new Date(value).getTime()) / (365.25 * 24 * 3600 * 1000);
      return age >= 14 && age <= 100;
    }, 'That date of birth does not look right.'),
});

/**
 * Step 2.
 *
 * "At least one course" is enforced in the action rather than here, because the
 * rule is conditional: it holds whenever the institution has a catalog, and
 * must not hold for the first student at an institution whose catalog has not
 * been loaded yet. A schema cannot see that context; the action can.
 */
export const coursesSchema = z.object({
  offeringIds: z
    .array(z.uuid())
    .max(12, 'Twelve courses is the most we can match on at once.')
    /* Two identical ids would violate the unique constraint on enrollments. */
    .transform((ids) => [...new Set(ids)]),
});

/** Step 3. Three multi-selects and one yes/no, exactly as specified. */
export const preferencesSchema = z.object({
  preferredTimeBlocks: z
    .array(z.enum(['morning', 'noon', 'evening']))
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
  /*
   * A STRICT filter in matching, not a weight: two students with disjoint
   * formats are never shown to each other, so at least one answer is required.
   */
  studyFormats: z
    .array(z.enum(['in_person', 'remote']))
    .min(1, 'Choose at least one way of meeting.')
    .transform((values) => [...new Set(values)]),
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
