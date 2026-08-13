/**
 * File:        tests/unit/academic-year.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The rules behind the autumn "did you move up a year?" prompt.
 *
 *              THE SNOOZE IS THE TEST THAT MATTERS. "Ask me later" is stored as
 *              a date in the past, chosen so the six-month rule lets the
 *              question through again in a week — so the rule and the snooze are
 *              two halves of one calculation, and the only way to know they
 *              still agree is to run them against each other. Get it wrong in
 *              one direction and the dialog returns tomorrow; wrong in the
 *              other and it never returns at all.
 * Version:     0.24.0
 *
 * Modifications:
 *     0.24.0 - 2026-08-13 - Initial implementation (Phase 9B)
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_YEAR_OF_STUDY,
  SNOOZE_DAYS,
  shouldPromptForAcademicYear,
  snoozedPromptDate,
  subMonths,
} from '@/features/profile/academic-year';

/** A date inside the prompt window. */
const IN_SEPTEMBER = new Date('2026-09-15T09:00:00Z');

/**
 * Shifts a date by whole days.
 *
 * @param date - The starting point.
 * @param days - How many days to move; negative goes back.
 * @returns A new Date.
 */
function addDays(date: Date, days: number): Date {
  const moved = new Date(date.getTime());
  moved.setDate(moved.getDate() + days);
  return moved;
}

describe('subMonths', () => {
  it('clamps rather than overflowing into the following month', () => {
    /* Six months before 31 August is the end of February, not the 2nd of March.
       Left to setMonth, the excess days roll forward and the re-prompt arrives
       late in exactly the months this feature runs in. */
    const result = subMonths(new Date('2026-08-31T12:00:00'), 6);

    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(28);
  });

  it('crosses the turn of the year', () => {
    const result = subMonths(new Date('2026-01-10T12:00:00'), 6);

    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(6);
  });
});

describe('shouldPromptForAcademicYear', () => {
  it('asks in the autumn when it has never asked before', () => {
    expect(
      shouldPromptForAcademicYear({ yearOfStudy: 2, lastPromptDate: null }, IN_SEPTEMBER),
    ).toBe(true);
  });

  it('stays quiet outside August to November', () => {
    for (const month of ['2026-03-15', '2026-07-31', '2026-12-01', '2026-01-05']) {
      expect(
        shouldPromptForAcademicYear(
          { yearOfStudy: 2, lastPromptDate: null },
          new Date(`${month}T09:00:00`),
        ),
        month,
      ).toBe(false);
    }
  });

  it('covers the whole window, edge months included', () => {
    for (const month of ['2026-08-01', '2026-09-15', '2026-10-20', '2026-11-30']) {
      expect(
        shouldPromptForAcademicYear(
          { yearOfStudy: 2, lastPromptDate: null },
          new Date(`${month}T09:00:00`),
        ),
        month,
      ).toBe(true);
    }
  });

  it('does not ask twice in one academic year', () => {
    /* Answered a fortnight ago: settled until well past this autumn. */
    const answered = addDays(IN_SEPTEMBER, -14).toISOString();

    expect(
      shouldPromptForAcademicYear({ yearOfStudy: 2, lastPromptDate: answered }, IN_SEPTEMBER),
    ).toBe(false);
  });

  it('asks again once six months have passed', () => {
    const longAgo = subMonths(IN_SEPTEMBER, 7).toISOString();

    expect(
      shouldPromptForAcademicYear({ yearOfStudy: 2, lastPromptDate: longAgo }, IN_SEPTEMBER),
    ).toBe(true);
  });

  it('says nothing when there is no year to advance', () => {
    expect(
      shouldPromptForAcademicYear({ yearOfStudy: null, lastPromptDate: null }, IN_SEPTEMBER),
    ).toBe(false);
  });

  it('says nothing to a student already at the ceiling', () => {
    /* "Yes" would be refused by the CHECK constraint, so the question is not
       worth asking. */
    expect(
      shouldPromptForAcademicYear(
        { yearOfStudy: MAX_YEAR_OF_STUDY, lastPromptDate: null },
        IN_SEPTEMBER,
      ),
    ).toBe(false);
  });

  it('treats an unparseable stored date as never asked', () => {
    expect(
      shouldPromptForAcademicYear(
        { yearOfStudy: 2, lastPromptDate: 'not a date' },
        IN_SEPTEMBER,
      ),
    ).toBe(true);
  });
});

describe('snoozedPromptDate', () => {
  it('keeps the dialog away for the whole snooze, then brings it back', () => {
    const snoozed = snoozedPromptDate(IN_SEPTEMBER).toISOString();

    /* Silent for every day of the snooze, including the day before it ends. */
    for (let day = 0; day < SNOOZE_DAYS; day += 1) {
      expect(
        shouldPromptForAcademicYear(
          { yearOfStudy: 2, lastPromptDate: snoozed },
          addDays(IN_SEPTEMBER, day),
        ),
        `day ${day}`,
      ).toBe(false);
    }

    /* And back on the day it expires. */
    expect(
      shouldPromptForAcademicYear(
        { yearOfStudy: 2, lastPromptDate: snoozed },
        addDays(IN_SEPTEMBER, SNOOZE_DAYS),
      ),
    ).toBe(true);
  });

  it('is a date in the past, which is what lets one column carry both meanings', () => {
    expect(snoozedPromptDate(IN_SEPTEMBER).getTime()).toBeLessThan(IN_SEPTEMBER.getTime());
  });
});
