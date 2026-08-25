/**
 * File:        src/features/courses/course-view.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The shape of an enrolled course as the UI consumes it, and the
 *              pure logic for resolving a per-course preference override against
 *              the student's global answer.
 *
 *              THE RESOLUTION RULE LIVES HERE AND IN SQL, and the two must agree:
 *              the matching function resolves overrides to decide who is shown,
 *              and this resolves them to decide what the screen says is in force.
 *              They are tested against the same rule — null inherits, a set value
 *              wins — because a screen that claims one thing while the ranking
 *              does another is worse than no screen.
 *
 *              Kept out of queries.ts because that module is `server-only`; the
 *              override modal is a client component and needs these types.
 * Version:     0.48.0
 *
 * Modifications:
 *     0.48.0 - 2026-08-19 - courseInitials, for the badges that used to show a
 *                           catalogue number
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

/**
 * A short glyph for a course, for the places a code used to sit.
 *
 * THE CODE WAS DOING TWO JOBS and only one of them survives. It identified the
 * course, which the name does better, and it filled a small square on a block of
 * colour where a full name will not fit — the course page's badge and the card's
 * banner. Initials keep that second job without putting a catalogue number back
 * on the screen, and they are stable: the same course always draws the same mark.
 *
 * Short words are skipped so "Introduction to the Theory of Computation" reads
 * as ITC rather than ITTOC, and a single-word name falls back to its first two
 * letters so it is never a lone character.
 *
 * @param name - The course's name.
 * @returns Two or three uppercase letters.
 */
export function courseInitials(name: string): string {
  const skip = new Set(['to', 'of', 'the', 'and', 'in', 'for', 'a', 'an']);

  const words = name
    .split(/[\s\-–—:/]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((word) => word.length > 0 && !skip.has(word.toLowerCase()));

  if (words.length === 0) {
    return name.slice(0, 2).toUpperCase() || '—';
  }

  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return words
    .slice(0, 3)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

/** The four preferences a student may answer differently per course. */
export interface CoursePreferenceValues {
  preferredTimeBlocks: string[];
  studyEnvironments: string[];
  studyFormats: string[];
  groupSizes: string[];
}

/** Null on a field means "inherit my global answer". */
export type CoursePreferenceOverride = {
  [K in keyof CoursePreferenceValues]: string[] | null;
};

export interface EnrolledCourseView {
  offeringId: string;
  courseId: string;
  code: string;
  name: string;
  faculty: string | null;
  /** Where the course came from; generated lists carry a warning. */
  source: string;
  /** What the student wants out of this course. */
  intent: string;
  /** Classmates in this course, excluding the student. */
  classmateCount: number;
  /** The override as stored, with nulls meaning inherit. */
  override: CoursePreferenceOverride;
}

/** Field names, in the order the modal shows them. */
export const OVERRIDE_FIELDS = [
  'studyFormats',
  'preferredTimeBlocks',
  'studyEnvironments',
  'groupSizes',
] as const satisfies ReadonlyArray<keyof CoursePreferenceValues>;

/**
 * Resolves what actually governs a course.
 *
 * The same rule the matching function applies in SQL: a set override wins, null
 * inherits. Expressed once here so the UI cannot disagree with the ranking about
 * which answer is in force.
 *
 * @param globals  - The student's global preferences.
 * @param override - The per-course override, fields possibly null.
 * @returns The values in force for this course.
 */
export function resolveCoursePreferences(
  globals: CoursePreferenceValues,
  override: CoursePreferenceOverride,
): CoursePreferenceValues {
  return {
    preferredTimeBlocks: override.preferredTimeBlocks ?? globals.preferredTimeBlocks,
    studyEnvironments: override.studyEnvironments ?? globals.studyEnvironments,
    studyFormats: override.studyFormats ?? globals.studyFormats,
    groupSizes: override.groupSizes ?? globals.groupSizes,
  };
}

/**
 * Whether a course departs from the global answer at all.
 *
 * Drives the "Custom for this course" badge. A student with twelve courses needs
 * to see which ones they have changed without opening each.
 *
 * @param override - The per-course override.
 * @returns True when any field is set.
 */
export function hasOverride(override: CoursePreferenceOverride): boolean {
  return OVERRIDE_FIELDS.some((field) => override[field] !== null);
}

/**
 * Counts the fields that differ from the global answer.
 *
 * A field set to exactly the global value is NOT counted as a difference — a
 * student who opens the modal, changes nothing and saves should not be told they
 * have customised the course.
 *
 * @param globals  - The global preferences.
 * @param override - The per-course override.
 * @returns How many fields genuinely differ.
 */
export function countDifferences(
  globals: CoursePreferenceValues,
  override: CoursePreferenceOverride,
): number {
  return OVERRIDE_FIELDS.filter((field) => {
    const value = override[field];

    if (value === null) {
      return false;
    }

    return !sameSet(value, globals[field]);
  }).length;
}

/**
 * Set equality, order-insensitive.
 *
 * These are multi-selects, so ['morning','evening'] and ['evening','morning']
 * are the same answer, and comparing them as arrays would report a difference
 * that does not exist.
 *
 * @param a - One set of values.
 * @param b - The other.
 * @returns True when both contain exactly the same values.
 */
export function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  const other = new Set(b);

  return a.every((value) => other.has(value));
}

/**
 * Reduces a submitted override to what is worth storing.
 *
 * A field equal to the global answer is stored as null rather than as a copy.
 * Otherwise a student's global change would silently fail to reach courses they
 * had "customised" to the same value they were already using.
 *
 * @param globals   - The global preferences.
 * @param submitted - What the modal collected.
 * @returns The override to persist, with redundant fields nulled.
 */
export function normaliseOverride(
  globals: CoursePreferenceValues,
  submitted: CoursePreferenceValues,
): CoursePreferenceOverride {
  const result = {} as CoursePreferenceOverride;

  for (const field of OVERRIDE_FIELDS) {
    result[field] = sameSet(submitted[field], globals[field]) ? null : submitted[field];
  }

  return result;
}
