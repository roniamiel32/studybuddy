/**
 * File:        src/features/courses/extract-schema.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The shape a course-extraction reply must have, and the types that
 *              go with it.
 *
 *              Split from `extract.ts` for the same reason `catalog-schema.ts`
 *              is split from `generate.ts`: that module is `server-only`, and
 *              the client component needs these types to render the review list.
 *
 *              EVERY FIELD HERE IS THE MODEL'S CLAIM, not a fact. `isDuplicate`
 *              and `existingCourseId` are re-checked against the real catalog in
 *              `extract.ts` before anything reaches the UI, because a model will
 *              happily return an id it invented.
 * Version:     0.42.0
 *
 * Modifications:
 *     0.42.0 - 2026-08-16 - Initial implementation (schedule import)
 */

import { z } from 'zod';

/**
 * Upper bound on one extraction.
 *
 * A semester's timetable is a dozen courses at the outside; a reply with fifty
 * has read the whole degree plan off the page, or is hallucinating. Either way
 * it is not what the student uploaded.
 */
export const MAX_EXTRACTED_COURSES = 30;

/** Files the agent can read. Anything else is refused before the model is called. */
export const ACCEPTED_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
] as const;

/**
 * Cap on an uploaded schedule.
 *
 * Base64 inflates by about a third, and the request as a whole has to stay
 * inside the provider's 32 MB ceiling. 8 MB leaves room and is far more than a
 * phone photo of a timetable needs.
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Blank strings normalise to null.
 *
 * Models return `""` for "no value" about as often as they return `null`, and a
 * course numbered empty-string would render as a stray separator in the UI.
 */
const nullableText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max).nullable(),
  );

export const extractedCourseSchema = z.object({
  courseName: z.string().trim().min(2).max(160),
  courseNumber: nullableText(32),
  /** Whether this reads as a real academic course rather than a room or a break. */
  isValid: z.boolean(),
  /** Whether it is the same course as one already in the degree's catalog. */
  isDuplicate: z.boolean(),
  /** The catalog course it matched. Verified against the real catalog downstream. */
  existingCourseId: nullableText(64),
  /** One sentence the student can read. Shown verbatim, so it must stay short. */
  reason: z.string().trim().min(1).max(300),
});

export const extractionSchema = z.object({
  extractedCourses: z.array(extractedCourseSchema).max(MAX_EXTRACTED_COURSES),
});

export type ExtractedCourse = z.infer<typeof extractedCourseSchema>;

/**
 * An extracted course after the server has checked its claims.
 *
 * `offeringId` is what the picker actually needs — a course with no offering
 * this term cannot be enrolled in, so a duplicate the student cannot select is
 * still worth showing but must not look selectable.
 */
export interface ReviewedCourse extends ExtractedCourse {
  offeringId: string | null;
}

export interface CourseReview {
  /** Which flow produced this, so the UI can word itself correctly. */
  source: 'text' | 'file';
  courses: ReviewedCourse[];
  /**
   * False when the result came from the deterministic fallback rather than a
   * model. Drives the AI disclaimer — claiming an agent wrote a list that a
   * string comparison produced would be the same lie in the other direction.
   */
  generatedByAi: boolean;
}

/**
 * Normalises a course name or code for comparison.
 *
 * Strips punctuation, spacing and case, so "CS-101", "cs 101" and "CS101" are
 * one key. Hebrew is kept alongside Latin, because a course list at an Israeli
 * university is routinely half in each. Deliberately crude: this backs the
 * no-model fallback and the duplicate re-check, both of which want obvious
 * matches only.
 *
 * @param value - A course name or code.
 * @returns A comparison key.
 */
export function comparisonKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9֐-׿]/g, '');
}

/** One course already in the degree's catalog, as the agent is shown it. */
export interface ExistingCourse {
  courseId: string;
  code: string;
  name: string;
}

/**
 * Matches typed input against the catalog without a model.
 *
 * The deployment may have no AI key, and a student typing a course name is the
 * one flow that does not need one to be useful. It only finds obvious matches —
 * same code or same name once punctuation and case are gone — and says so
 * plainly rather than implying an agent looked at it.
 *
 * Lives here rather than in `extract.ts` for the same reason the schema does:
 * that module is `server-only`, and this is pure enough to unit test.
 *
 * @param text     - What the student typed.
 * @param existing - The degree's catalog.
 * @returns A single entry, shaped like a model reply.
 */
export function matchCourseLocally(
  text: string,
  existing: ExistingCourse[],
): ExtractedCourse {
  const key = comparisonKey(text);

  const hit = existing.find(
    (course) => comparisonKey(course.code) === key || comparisonKey(course.name) === key,
  );

  if (hit) {
    return {
      courseName: hit.name,
      courseNumber: hit.code,
      isValid: true,
      isDuplicate: true,
      existingCourseId: hit.courseId,
      reason: `Already in your course list as ${hit.code}.`,
    };
  }

  return {
    courseName: text.trim(),
    courseNumber: null,
    /*
     * Claimed valid without checking. Nothing here can judge whether a name is a
     * real course, and refusing what a student typed about their own degree on
     * the strength of no evidence would be worse than accepting it.
     */
    isValid: true,
    isDuplicate: false,
    existingCourseId: null,
    reason: 'We could not find this in your degree’s course list.',
  };
}
