/**
 * File:        tests/unit/placeholder-catalog.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Tests for the stock curriculum used when no model is configured.
 *
 *              Two things matter here and are tested as invariants across every
 *              degree the app can offer: the list is never empty, because an
 *              empty step 2 leaves a student unmatchable, and every catalog
 *              validates against the same schema a model's reply must pass —
 *              handwritten data gets no exemption from the checks that keep the
 *              database consistent.
 * Version:     0.11.0
 *
 * Modifications:
 *     0.11.0 - 2026-08-09 - Initial tests
 */

import { describe, expect, it } from 'vitest';

import { generatedCatalogSchema } from '@/features/courses/catalog-schema';
import { codePrefix, placeholderCatalog } from '@/features/courses/placeholder-catalog';

/* Every degree in the seed, plus the set provisioned for a new institution. */
const ALL_DEGREES = [
  'Computer Science',
  'Data Science',
  'Economics',
  'Psychology',
  'Business Administration',
  'Law',
  'Government',
  'Communications',
  'Entrepreneurship',
  'Electrical Engineering',
  'Business & Computer Science',
  'Economics & Computer Science',
  'Engineering',
  'Business',
  'Natural Sciences',
  'Social Sciences',
  'Humanities',
  'Medicine & Health',
  'Arts & Design',
  'Other',
];

describe('placeholderCatalog', () => {
  it('returns the courses the fix was asked for, for Law', () => {
    const names = placeholderCatalog('Law', 'bachelors').map((course) => course.name);

    expect(names).toContain('Introduction to Law');
    expect(names).toContain('Constitutional Law');
    expect(names).toContain('Contract Law');
  });

  it('never returns an empty catalog, for any degree the app offers', () => {
    /*
     * The invariant that matters. An empty list is a dead end: matching runs on
     * shared courses, so a student who leaves step 2 with none cannot be matched
     * on anything, and the remaining steps cannot fix it.
     */
    for (const degree of ALL_DEGREES) {
      for (const level of ['bachelors', 'masters', 'phd']) {
        expect(placeholderCatalog(degree, level).length, `${degree} (${level})`).toBeGreaterThan(0);
      }
    }
  });

  it('produces catalogs a model reply would also have to pass', () => {
    for (const degree of ALL_DEGREES) {
      const parsed = generatedCatalogSchema.safeParse(placeholderCatalog(degree, 'bachelors'));

      expect(parsed.success, `${degree}: ${parsed.error?.issues[0]?.message}`).toBe(true);
    }
  });

  it('keeps course codes unique within a degree', () => {
    for (const degree of ALL_DEGREES) {
      const codes = placeholderCatalog(degree, 'bachelors').map((course) => course.code);

      expect(new Set(codes).size, degree).toBe(codes.length);
    }
  });

  it('keeps codes unique ACROSS degrees, which the unique key requires', () => {
    /*
     * `courses` is unique on (university_id, code) and a course row has one
     * degree_id. A code shared by two degrees would therefore be inserted once
     * and silently missing from the second degree's list — so the prefix has to
     * separate them.
     */
    const seen = new Map<string, string>();

    for (const degree of ALL_DEGREES) {
      for (const course of placeholderCatalog(degree, 'bachelors')) {
        const owner = seen.get(course.code);
        expect(owner ?? degree, `${course.code} is used by both ${owner} and ${degree}`).toBe(
          degree,
        );
        seen.set(course.code, degree);
      }
    }
  });

  it('gives a combined degree courses from both subjects', () => {
    const names = placeholderCatalog('Economics & Computer Science', 'bachelors').map(
      (course) => course.name,
    );

    /* These students sit in both sets of lectures, so both must be offerable. */
    expect(names).toContain('Introduction to Computer Science');
    expect(names.some((name) => name.includes('economics') || name.includes('Economics'))).toBe(
      true,
    );
  });

  it('does not offer an introductory course to a graduate student', () => {
    const names = placeholderCatalog('Computer Science', 'masters').map((course) => course.name);

    expect(names.some((name) => name.startsWith('Introduction to'))).toBe(false);
    expect(names).toContain('Advanced Topics in Computer Science');
  });

  it('falls back to the degree name for a subject it does not know', () => {
    const catalog = placeholderCatalog('Maritime Studies', 'bachelors');
    const names = catalog.map((course) => course.name);

    /*
     * Naming courses after the degree is a safe claim; inventing subject matter
     * for a discipline the list knows nothing about is not.
     */
    expect(names).toContain('Introduction to Maritime Studies');
    expect(catalog.length).toBeGreaterThan(0);
  });

  it('does not put the degree name in a course when the name says nothing', () => {
    /* 'Other' is in the default list a new institution gets, and
       "Introduction to Other" is not a course. */
    for (const level of ['bachelors', 'masters']) {
      const names = placeholderCatalog('Other', level).map((course) => course.name);

      expect(names.length).toBeGreaterThan(0);
      expect(names.some((name) => name.includes('Other'))).toBe(false);
    }
  });

  it('does not mistake an unrelated degree for an arts one', () => {
    /* 'art' as a bare fragment matches Cartography and Earth Sciences. */
    const names = placeholderCatalog('Cartography', 'bachelors').map((course) => course.name);

    expect(names).not.toContain('Typography');
    expect(names).toContain('Introduction to Cartography');
  });

  it('caps a catalog at twelve courses', () => {
    for (const degree of ALL_DEGREES) {
      expect(placeholderCatalog(degree, 'bachelors').length).toBeLessThanOrEqual(12);
    }
  });
});

describe('codePrefix', () => {
  it('reads as a stem for one word and initials for several', () => {
    expect(codePrefix('Law')).toBe('LAW');
    expect(codePrefix('Computer Science')).toBe('CS');
    expect(codePrefix('Business & Computer Science')).toBe('BCS');
  });

  it('always returns something usable, even for an unnameable degree', () => {
    expect(codePrefix('—')).toBe('GEN');
    expect(codePrefix('')).toBe('GEN');
  });
});
