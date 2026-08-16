/**
 * File:        tests/unit/course-extract.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Unit tests for the schedule import's pure parts — the schema that
 *              decides whether a model reply is usable, the comparison key, and
 *              the no-model fallback.
 *
 *              The schema is the interesting half. It is the only thing standing
 *              between a model's output and a student's course list, so the
 *              tests are mostly about what it REFUSES: a missing verdict, an
 *              invented shape, a reply long enough to be a hallucinated degree
 *              plan.
 * Version:     0.42.0
 *
 * Modifications:
 *     0.42.0 - 2026-08-16 - Initial implementation (schedule import)
 */

import { describe, expect, it } from 'vitest';

import {
  comparisonKey,
  extractionSchema,
  matchCourseLocally,
  MAX_EXTRACTED_COURSES,
  type ExistingCourse,
} from '@/features/courses/extract-schema';

const CATALOG: ExistingCourse[] = [
  { courseId: 'c-1', code: 'CS-1001', name: 'Introduction to Computer Science' },
  { courseId: 'c-2', code: 'CS-3020', name: 'Operating Systems' },
];

/**
 * Builds a valid entry, so each test can vary exactly one field.
 *
 * @param overrides - The field under test.
 * @returns A model-shaped entry.
 */
function entry(overrides: Record<string, unknown> = {}) {
  return {
    courseName: 'Operating Systems',
    courseNumber: 'CS-3020',
    isValid: true,
    isDuplicate: true,
    existingCourseId: 'c-2',
    reason: 'Already in your course list as CS-3020.',
    ...overrides,
  };
}

describe('extractionSchema', () => {
  it('accepts a well-formed reply', () => {
    const parsed = extractionSchema.safeParse({ extractedCourses: [entry()] });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.extractedCourses[0]?.existingCourseId).toBe('c-2');
  });

  it('accepts an empty list, which is what a schedule with no courses looks like', () => {
    expect(extractionSchema.safeParse({ extractedCourses: [] }).success).toBe(true);
  });

  it('normalises a blank course number to null', () => {
    // Models return "" for "no value" about as often as they return null, and a
    // course numbered empty-string renders as a stray separator.
    const parsed = extractionSchema.parse({
      extractedCourses: [entry({ courseNumber: '   ' })],
    });

    expect(parsed.extractedCourses[0]?.courseNumber).toBeNull();
  });

  it('normalises a blank existingCourseId to null', () => {
    const parsed = extractionSchema.parse({
      extractedCourses: [entry({ existingCourseId: '' })],
    });

    expect(parsed.extractedCourses[0]?.existingCourseId).toBeNull();
  });

  it('rejects a reply with no verdict on it', () => {
    // A missing isValid is not "assume valid" — an entry the model would not
    // judge is exactly the one a student should not have silently enrolled in.
    const withoutVerdict: Record<string, unknown> = entry();
    delete withoutVerdict.isValid;

    expect(
      extractionSchema.safeParse({ extractedCourses: [withoutVerdict] }).success,
    ).toBe(false);
  });

  it('rejects a verdict that is a string rather than a boolean', () => {
    expect(
      extractionSchema.safeParse({ extractedCourses: [entry({ isDuplicate: 'yes' })] })
        .success,
    ).toBe(false);
  });

  it('rejects an entry with no reason, which the UI shows verbatim', () => {
    expect(
      extractionSchema.safeParse({ extractedCourses: [entry({ reason: '' })] }).success,
    ).toBe(false);
  });

  it('rejects more courses than a semester could hold', () => {
    // A reply this long has read the whole degree plan off the page, or is
    // hallucinating. Either way it is not what the student uploaded.
    const many = Array.from({ length: MAX_EXTRACTED_COURSES + 1 }, () => entry());

    expect(extractionSchema.safeParse({ extractedCourses: many }).success).toBe(false);
  });

  it('rejects a bare array — the object wrapper is part of the contract', () => {
    expect(extractionSchema.safeParse([entry()]).success).toBe(false);
  });
});

describe('comparisonKey', () => {
  it('collapses case, spacing and punctuation', () => {
    expect(comparisonKey('CS-1001')).toBe(comparisonKey('cs 1001'));
    expect(comparisonKey('CS-1001')).toBe(comparisonKey('CS1001'));
  });

  it('keeps Hebrew, because half a course list is routinely in it', () => {
    expect(comparisonKey('מבוא למדעי המחשב')).toBe(comparisonKey('מבוא למדעי המחשב!'));
    expect(comparisonKey('מבוא')).not.toBe('');
  });

  it('does not collapse two different courses into one key', () => {
    expect(comparisonKey('Calculus 1')).not.toBe(comparisonKey('Calculus 2'));
  });
});

describe('matchCourseLocally', () => {
  it('matches on the course name, ignoring case and spacing', () => {
    const result = matchCourseLocally('  operating systems ', CATALOG);

    expect(result.isDuplicate).toBe(true);
    expect(result.existingCourseId).toBe('c-2');
    /* The catalog's wording wins, not the student's typing. */
    expect(result.courseName).toBe('Operating Systems');
  });

  it('matches on the course code', () => {
    expect(matchCourseLocally('cs1001', CATALOG).existingCourseId).toBe('c-1');
  });

  it('reports an unknown course as new rather than refusing it', () => {
    const result = matchCourseLocally('Quantum Basket Weaving', CATALOG);

    expect(result.isDuplicate).toBe(false);
    expect(result.existingCourseId).toBeNull();
    /* Nothing here can judge whether a name is a real course, so it does not try. */
    expect(result.isValid).toBe(true);
  });

  it('does not match a course that merely shares a subject', () => {
    // "Introduction to Computer Science" and "Computer Science" are different
    // courses, and a substring match would have conflated them.
    expect(matchCourseLocally('Computer Science', CATALOG).isDuplicate).toBe(false);
  });

  it('produces something the schema accepts', () => {
    // The fallback is rendered by the same component as a model reply, so it has
    // to satisfy the same contract.
    const parsed = extractionSchema.safeParse({
      extractedCourses: [matchCourseLocally('Operating Systems', CATALOG)],
    });

    expect(parsed.success).toBe(true);
  });
});
