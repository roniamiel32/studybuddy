/**
 * File:        src/features/courses/catalog-schema.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The shape a course catalog must have to be stored, and the type
 *              that goes with it.
 *
 *              Split out of `generate.ts` because that module is `server-only`:
 *              this half is pure validation with no server dependency, so
 *              keeping it separate lets the placeholder catalog and the unit
 *              tests use it without dragging a server module into a browser or
 *              jsdom bundle.
 * Version:     0.11.0
 *
 * Modifications:
 *     0.11.0 - 2026-08-09 - Split out of features/courses/generate.ts
 */

import { z } from 'zod';

import type { Database } from '@/types/database.types';

/**
 * Where a course came from.
 *
 * Derived from the database enum rather than restated, so adding a provenance
 * value in a migration is a compile error everywhere that has to handle it —
 * which is the point, since two of these values mean "unverified" and must be
 * labelled as such wherever a student sees them.
 */
export type CourseSource = Database['public']['Enums']['course_source'];

/** Provenance values that must be shown to a student as unverified. */
export const UNVERIFIED_SOURCES: readonly CourseSource[] = ['ai_generated', 'placeholder'];

/** Upper bound on a generated catalog. A degree with 200 courses is a bad reply. */
export const MAX_GENERATED_COURSES = 40;

/**
 * The shape a reply must have to be stored.
 *
 * Anything failing this is discarded whole rather than partially salvaged: a
 * half-parsed catalog is worse than none, because a student cannot tell which
 * half is missing.
 */
export const generatedCourseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(32)
    /* Codes become part of a unique key, so keep them to safe characters. */
    .regex(/^[A-Za-z0-9][A-Za-z0-9 .\-/]*$/, 'unsupported characters in course code'),
  name: z.string().trim().min(3).max(160),
  /* Optional: the model often knows a faculty, and it is useful when present. */
  faculty: z.string().trim().max(120).optional(),
});

export const generatedCatalogSchema = z
  .array(generatedCourseSchema)
  .min(1)
  .max(MAX_GENERATED_COURSES)
  /* Duplicate codes would collide on insert; keep the first of each. */
  .transform((courses) => {
    const seen = new Set<string>();
    return courses.filter((course) => {
      const key = course.code.toUpperCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  });

export type GeneratedCourse = z.infer<typeof generatedCourseSchema>;
