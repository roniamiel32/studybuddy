/**
 * File:        tests/unit/course-view.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Unit tests for per-course preference resolution.
 *
 *              THE RULE IS IMPLEMENTED TWICE — here in TypeScript, so the screen
 *              can say what governs a course, and in SQL, so the matching function
 *              can rank on it. Two implementations of one rule is a standing risk,
 *              and these tests pin the TypeScript half to exactly what the
 *              migration's coalesce does: a set value wins, null inherits.
 *
 *              The normalisation tests matter as much. Storing a copy of the
 *              global answer instead of null would mean a later change to the
 *              global preference silently skipped that course, and the student
 *              would have no way to find out why.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - Initial tests (Phase 4)
 */

import { describe, expect, it } from 'vitest';

import {
  countDifferences,
  hasOverride,
  normaliseOverride,
  resolveCoursePreferences,
  sameSet,
  type CoursePreferenceOverride,
  type CoursePreferenceValues,
} from '@/features/courses/course-view';

const globals: CoursePreferenceValues = {
  preferredTimeBlocks: ['morning', 'evening'],
  studyEnvironments: ['quiet'],
  studyFormats: ['in_person', 'remote'],
  groupSizes: ['small'],
};

/** An override with nothing set — the state every enrolment starts in. */
const inherited: CoursePreferenceOverride = {
  preferredTimeBlocks: null,
  studyEnvironments: null,
  studyFormats: null,
  groupSizes: null,
};

describe('resolveCoursePreferences', () => {
  it('inherits every field when nothing is overridden', () => {
    expect(resolveCoursePreferences(globals, inherited)).toEqual(globals);
  });

  it('takes the override where one is set', () => {
    const resolved = resolveCoursePreferences(globals, {
      ...inherited,
      studyFormats: ['in_person'],
    });

    /* The user's own example: remote generally, in person for this class. */
    expect(resolved.studyFormats).toEqual(['in_person']);
    /* And nothing else moves. */
    expect(resolved.preferredTimeBlocks).toEqual(['morning', 'evening']);
    expect(resolved.studyEnvironments).toEqual(['quiet']);
    expect(resolved.groupSizes).toEqual(['small']);
  });

  it('resolves several overridden fields at once', () => {
    const resolved = resolveCoursePreferences(globals, {
      preferredTimeBlocks: ['noon'],
      studyEnvironments: ['discussion'],
      studyFormats: ['in_person'],
      groupSizes: ['large'],
    });

    expect(resolved).toEqual({
      preferredTimeBlocks: ['noon'],
      studyEnvironments: ['discussion'],
      studyFormats: ['in_person'],
      groupSizes: ['large'],
    });
  });

  it('treats an override as authoritative even when it is narrower', () => {
    /* Narrowing is the whole point — it is how a student says "not for this one". */
    const resolved = resolveCoursePreferences(globals, {
      ...inherited,
      preferredTimeBlocks: ['morning'],
    });

    expect(resolved.preferredTimeBlocks).toEqual(['morning']);
  });
});

describe('hasOverride', () => {
  it('is false when everything inherits', () => {
    expect(hasOverride(inherited)).toBe(false);
  });

  it('is true as soon as one field is set', () => {
    expect(hasOverride({ ...inherited, groupSizes: ['large'] })).toBe(true);
  });
});

describe('sameSet', () => {
  it('ignores order, because these are multi-selects', () => {
    expect(sameSet(['morning', 'evening'], ['evening', 'morning'])).toBe(true);
  });

  it('distinguishes different lengths', () => {
    expect(sameSet(['morning'], ['morning', 'evening'])).toBe(false);
  });

  it('distinguishes different values', () => {
    expect(sameSet(['morning'], ['evening'])).toBe(false);
  });

  it('treats two empty sets as equal', () => {
    expect(sameSet([], [])).toBe(true);
  });
});

describe('normaliseOverride', () => {
  it('stores null for a field that matches the global answer', () => {
    /*
     * The important case. A student opens the modal, changes one thing and saves;
     * the other three arrive identical to their defaults. Storing copies would
     * freeze this course against future changes to those defaults.
     */
    const normalised = normaliseOverride(globals, {
      ...globals,
      studyFormats: ['in_person'],
    });

    expect(normalised.studyFormats).toEqual(['in_person']);
    expect(normalised.preferredTimeBlocks).toBeNull();
    expect(normalised.studyEnvironments).toBeNull();
    expect(normalised.groupSizes).toBeNull();
  });

  it('stores nothing at all when the student changed nothing', () => {
    const normalised = normaliseOverride(globals, { ...globals });

    expect(hasOverride(normalised)).toBe(false);
  });

  it('ignores reordering, so a re-save does not invent an override', () => {
    /* The checkbox group can hand back the same answer in a different order. */
    const normalised = normaliseOverride(globals, {
      ...globals,
      preferredTimeBlocks: ['evening', 'morning'],
    });

    expect(normalised.preferredTimeBlocks).toBeNull();
    expect(hasOverride(normalised)).toBe(false);
  });

  it('keeps every field that genuinely differs', () => {
    const normalised = normaliseOverride(globals, {
      preferredTimeBlocks: ['noon'],
      studyEnvironments: ['discussion'],
      studyFormats: ['remote'],
      groupSizes: ['large'],
    });

    expect(normalised).toEqual({
      preferredTimeBlocks: ['noon'],
      studyEnvironments: ['discussion'],
      studyFormats: ['remote'],
      groupSizes: ['large'],
    });
  });

  it('round-trips: normalising then resolving returns what was submitted', () => {
    /*
     * The property that keeps the two halves honest. Whatever the student chose is
     * what governs the course, whether it was stored as a value or as null.
     */
    const submitted: CoursePreferenceValues = {
      preferredTimeBlocks: ['morning', 'evening'],
      studyEnvironments: ['discussion'],
      studyFormats: ['in_person', 'remote'],
      groupSizes: ['large'],
    };

    const resolved = resolveCoursePreferences(globals, normaliseOverride(globals, submitted));

    expect(resolved).toEqual(submitted);
  });
});

describe('countDifferences', () => {
  it('is zero when everything inherits', () => {
    expect(countDifferences(globals, inherited)).toBe(0);
  });

  it('counts only fields that actually differ', () => {
    /*
     * A field set to exactly the global value is not a difference. Telling a
     * student they have customised a course when they have not is how a "Custom
     * here" badge stops meaning anything.
     */
    const override: CoursePreferenceOverride = {
      preferredTimeBlocks: ['evening', 'morning'],
      studyEnvironments: ['discussion'],
      studyFormats: null,
      groupSizes: ['large'],
    };

    expect(countDifferences(globals, override)).toBe(2);
  });

  it('counts every field when all four differ', () => {
    expect(
      countDifferences(globals, {
        preferredTimeBlocks: ['noon'],
        studyEnvironments: ['discussion'],
        studyFormats: ['remote'],
        groupSizes: ['large'],
      }),
    ).toBe(4);
  });
});
