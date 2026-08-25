/**
 * File:        tests/unit/course-gatekeeper.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Unit tests for the course gatekeeper.
 *
 *              The matcher is now the WHOLE of the validation logic — there is no
 *              model behind it to cover for a bad call — so these tests carry the
 *              weight that a prompt used to. They are weighted towards the two
 *              ways a fuzzy matcher does damage: matching two different courses
 *              to each other, and matching one input to several courses and
 *              picking one at random.
 * Version:     0.44.0
 *
 * Modifications:
 *     0.44.0 - 2026-08-18 - Rewritten for the local matcher; year-group tests
 *                           removed with the feature
 *     0.43.0 - 2026-08-17 - Initial implementation (LLM gatekeeper)
 */

import { describe, expect, it } from 'vitest';

import {
  comparisonKey,
  editDistance,
  gatekeeperReplySchema,
  runGatekeeper,
  type ExistingCourse,
} from '@/features/courses/gatekeeper';

/**
 * Builds a catalog entry.
 *
 * @param name      - The course name.
 * @param code      - Its code.
 * @param offeringId - The offering, or null when it is not running.
 * @returns The entry.
 */
function course(name: string, code: string, offeringId: string | null = `o-${code}`): ExistingCourse {
  return { courseId: `c-${code}`, code, name, offeringId };
}

const CATALOG: ExistingCourse[] = [
  course('Introduction to Computer Science', 'CS-1001'),
  course('Discrete Mathematics', 'CS-1020'),
  course('Linear Algebra 1', 'CS-1030'),
  course('Linear Algebra 2', 'CS-1060'),
  course('Infinitesimal Calculus 1', 'CS-1040'),
  course('Infinitesimal Calculus 2', 'CS-1050'),
  course('Data Structures', 'CS-2010'),
  course('Operating Systems', 'CS-3020'),
  course('Machine Learning', 'CS-4010'),
  course('Computer Networks', 'CS-3060'),
];

describe('comparisonKey', () => {
  it('collapses case, spacing and punctuation', () => {
    expect(comparisonKey('CS-1001')).toBe(comparisonKey('cs 1001'));
    expect(comparisonKey('CS-1001')).toBe(comparisonKey('CS1001'));
  });

  it('keeps digits, which are the only thing separating two courses', () => {
    expect(comparisonKey('Linear Algebra 1')).not.toBe(comparisonKey('Linear Algebra 2'));
  });

  it('keeps Hebrew, because half a course list is routinely in it', () => {
    expect(comparisonKey('מבוא למדעי המחשב')).toBe(comparisonKey('מבוא למדעי המחשב!'));
    expect(comparisonKey('מבוא')).not.toBe('');
  });
});

describe('editDistance', () => {
  it('measures single edits', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('abc', 'abd')).toBe(1);
  });

  it('stops early once the cap is exceeded', () => {
    // The value past the cap is not meaningful, only that it exceeds it.
    expect(editDistance('completely', 'different', 2)).toBeGreaterThan(2);
  });

  it('handles an empty side', () => {
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('abc', '')).toBe(3);
  });
});

describe('runGatekeeper — matching an existing course', () => {
  it('matches an exact name', () => {
    const result = runGatekeeper('Operating Systems', CATALOG);

    expect(result.isValid).toBe(true);
    expect(result.isNew).toBe(false);
    expect(result.matchedCourseName).toBe('Operating Systems');
  });

  it('ignores case, spacing and punctuation', () => {
    for (const typed of ['operating systems', '  OPERATING   SYSTEMS ', 'Operating-Systems']) {
      expect(runGatekeeper(typed, CATALOG).matchedCourseName).toBe('Operating Systems');
    }
  });

  it('matches on the course code even though codes are no longer shown', () => {
    expect(runGatekeeper('cs-3020', CATALOG).matchedCourseName).toBe('Operating Systems');
  });

  it('corrects a small typo', () => {
    expect(runGatekeeper('Operatng Systems', CATALOG).matchedCourseName).toBe(
      'Operating Systems',
    );
    expect(runGatekeeper('Discrete Mathmatics', CATALOG).matchedCourseName).toBe(
      'Discrete Mathematics',
    );
  });

  it('expands an abbreviation', () => {
    expect(runGatekeeper('intro to computer science', CATALOG).matchedCourseName).toBe(
      'Introduction to Computer Science',
    );
    expect(runGatekeeper('OS', CATALOG).matchedCourseName).toBe('Operating Systems');
    expect(runGatekeeper('ML', CATALOG).matchedCourseName).toBe('Machine Learning');
  });

  it('resolves an acronym', () => {
    expect(runGatekeeper('ICS', CATALOG).matchedCourseName).toBe(
      'Introduction to Computer Science',
    );
  });

  it('matches a distinctive fragment of a longer name', () => {
    expect(runGatekeeper('networks', CATALOG).matchedCourseName).toBe('Computer Networks');
  });

  it('says when a match was not exact', () => {
    // A student who typed something slightly wrong should see that it was
    // interpreted, not silently swapped.
    expect(runGatekeeper('Operatng Systems', CATALOG).message).toMatch(/^Matched to /);
    expect(runGatekeeper('Operating Systems', CATALOG).message).not.toMatch(/^Matched to /);
  });
});

describe('runGatekeeper — the digit rule', () => {
  it('does not confuse two numbered courses one character apart', () => {
    // The whole reason the digit guard exists: these are one edit apart and are
    // different courses. Merging them would put two cohorts in one room.
    expect(runGatekeeper('Linear Algebra 1', CATALOG).matchedCourseName).toBe(
      'Linear Algebra 1',
    );
    expect(runGatekeeper('Linear Algebra 2', CATALOG).matchedCourseName).toBe(
      'Linear Algebra 2',
    );
    expect(runGatekeeper('Infinitesimal Calculus 2', CATALOG).matchedCourseName).toBe(
      'Infinitesimal Calculus 2',
    );
  });

  it('refuses to guess a number the student did not give', () => {
    // "Linear Algebra" could be either. Picking one is a coin flip.
    const result = runGatekeeper('Linear Algebra', CATALOG);

    expect(result.isValid).toBe(false);
    expect(result.isNew).toBe(false);
    expect(result.message).toMatch(/Linear Algebra 1.*Linear Algebra 2/);
  });

  it('does not treat a numbered course as a typo of an unnumbered one', () => {
    const catalog = [course('Databases', 'X-1')];

    expect(runGatekeeper('Databases 2', catalog).isNew).toBe(true);
  });
});

describe('runGatekeeper — ambiguity', () => {
  it('asks rather than choosing between equally good matches', () => {
    const result = runGatekeeper('calculus', CATALOG);

    expect(result.isValid).toBe(false);
    expect(result.isNew).toBe(false);
    expect(result.matchedCourseName).toBeNull();
    expect(result.message).toMatch(/Type the full name/);
  });

  it('never creates a course when the input was ambiguous', () => {
    // The dangerous outcome: a third "Calculus" row next to the two real ones.
    expect(runGatekeeper('calculus', CATALOG).isNew).toBe(false);
  });
});

describe('runGatekeeper — new courses', () => {
  it('accepts a plausible course name not in the catalog', () => {
    const result = runGatekeeper('Computer Vision', CATALOG);

    expect(result.isValid).toBe(true);
    expect(result.isNew).toBe(true);
    expect(result.matchedCourseName).toBeNull();
  });

  it('says plainly that nobody has checked a new course', () => {
    // The matcher knows nothing about real syllabuses. The wording has to admit
    // that rather than implying a verification that did not happen.
    expect(runGatekeeper('Computer Vision', CATALOG).message).toMatch(/Nobody has checked/);
  });

  it('never returns a year, because nothing here can estimate one', () => {
    for (const typed of ['Computer Vision', 'Operating Systems', 'calculus', 'hello']) {
      expect(runGatekeeper(typed, CATALOG).year).toBeNull();
    }
  });

  it('rejects input that is not shaped like a course name', () => {
    for (const typed of ['hi', 'asdfasdf', '???', 'Room 302', 'lunch break', '2026']) {
      const result = runGatekeeper(typed, CATALOG);
      expect(result.isValid, `expected ${typed} to be rejected`).toBe(false);
      expect(result.isNew).toBe(false);
    }
  });

  it('rejects a sentence', () => {
    expect(
      runGatekeeper(
        'please add the course that I take on Tuesday mornings with the tall lecturer',
        CATALOG,
      ).isValid,
    ).toBe(false);
  });

  it('accepts a Hebrew course name carrying an academic term', () => {
    /*
     * The plausibility check requires a recognised academic word, in either
     * alphabet. 'מבוא' (introduction) is one, so this reads as a course; a bare
     * 'ראייה ממוחשבת' does not and is refused by the case below.
     */
    const result = runGatekeeper('מבוא לראייה ממוחשבת', CATALOG);

    expect(result.isValid).toBe(true);
    expect(result.isNew).toBe(true);
  });

  it('refuses a name with no academic term in it', () => {
    // The allowlist is what stops "Bob's Tuesday Thing" becoming a course in the
    // shared catalog. It is a blunt instrument and it is meant to be.
    const result = runGatekeeper('Bobs Tuesday Thing', CATALOG);

    expect(result.isValid).toBe(false);
    expect(result.isNew).toBe(false);
  });
});

describe('runGatekeeper — the contract', () => {
  it('always returns the agreed shape', () => {
    const inputs = [
      'Operating Systems',
      'Operatng Systems',
      'calculus',
      'Computer Vision',
      'hi',
      'Room 302',
      'ראייה ממוחשבת',
      'OS',
    ];

    for (const typed of inputs) {
      const parsed = gatekeeperReplySchema.safeParse(runGatekeeper(typed, CATALOG));
      expect(parsed.success, `failed for "${typed}"`).toBe(true);
    }
  });

  it('never claims both a match and a new course', () => {
    for (const typed of ['Operating Systems', 'Computer Vision', 'calculus', 'hi']) {
      const result = runGatekeeper(typed, CATALOG);
      expect(result.isNew && result.matchedCourseName !== null).toBe(false);
    }
  });

  it('is a pure function — same input, same output', () => {
    expect(runGatekeeper('Operatng Systems', CATALOG)).toEqual(
      runGatekeeper('Operatng Systems', CATALOG),
    );
  });

  it('handles an empty catalog', () => {
    const result = runGatekeeper('Computer Vision', []);

    expect(result.isValid).toBe(true);
    expect(result.isNew).toBe(true);
  });
});
