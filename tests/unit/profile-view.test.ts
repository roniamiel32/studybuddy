/**
 * File:        tests/unit/profile-view.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Unit tests for the profile view model: the subtitle, the grouped
 *              onboarding answers, and the connections summary.
 *
 *              One test here is about privacy rather than formatting: the summary
 *              must never imply a denominator. "Studied with 3 classmates" is fine;
 *              "3 of 5 partners rated this person well" would leak the negative
 *              count the database is protecting.
 * Version:     0.18.0
 *
 * Modifications:
 *     0.18.0 - 2026-08-10 - Initial tests (Phase 6)
 */

import { describe, expect, it } from 'vitest';

import {
  connectionsSummary,
  labelsFor,
  preferenceSections,
  profileSubtitle,
} from '@/features/profiles/profile-view';
import { TIME_BLOCK_OPTIONS } from '@/config/onboarding';

describe('profileSubtitle', () => {
  it('joins degree, year and age', () => {
    expect(
      profileSubtitle({ degreeName: 'Computer Science', yearOfStudy: 2, age: 22 }),
    ).toBe('Computer Science · Year 2 · 22');
  });

  it('omits an age that was never given, rather than printing 0', () => {
    /* A withheld date of birth is not an age of zero. */
    expect(profileSubtitle({ degreeName: 'Law', yearOfStudy: 1, age: null })).toBe(
      'Law · Year 1',
    );
  });

  it('omits a missing year', () => {
    expect(profileSubtitle({ degreeName: 'Law', yearOfStudy: null, age: 20 })).toBe('Law · 20');
  });

  it('falls back rather than rendering an empty line', () => {
    expect(profileSubtitle({ degreeName: null, yearOfStudy: null, age: null })).toBe(
      'Classmate',
    );
  });
});

describe('labelsFor', () => {
  it('turns stored values into recognisable labels with their icons', () => {
    const labels = labelsFor(['morning', 'evening'], TIME_BLOCK_OPTIONS);

    expect(labels.map((entry) => entry.label)).toEqual(['Morning', 'Evening']);
    expect(labels[0].icon).toBeTruthy();
  });

  it('passes through a value it has no label for', () => {
    /* An enum can gain a value before this mapping does; showing the raw value
       beats showing "undefined" on someone's profile. */
    expect(labelsFor(['dawn'], TIME_BLOCK_OPTIONS)[0].label).toBe('dawn');
  });
});

describe('preferenceSections', () => {
  const full = {
    preferredTimeBlocks: ['morning'],
    studyEnvironments: ['quiet'],
    studyFormats: ['in_person'],
    groupSizes: ['small'],
    spokenLanguages: ['he'],
    studiesOnSaturday: false,
  };

  it('returns every answered section', () => {
    const sections = preferenceSections(full);

    expect(sections.map((section) => section.heading)).toEqual([
      'Prefers to meet',
      'Studies',
      'Works best',
      'Group size',
      'Can study in',
      'Saturdays',
    ]);
  });

  it('drops sections the student has not answered', () => {
    /* A profile with empty headings looks broken; an absent section reads as
       "they have not said". */
    const sections = preferenceSections({
      ...full,
      spokenLanguages: [],
      groupSizes: [],
    });

    expect(sections.map((section) => section.heading)).not.toContain('Can study in');
    expect(sections.map((section) => section.heading)).not.toContain('Group size');
  });

  it('renders the Saturday answer either way, but not when unset', () => {
    expect(
      preferenceSections({ ...full, studiesOnSaturday: true }).at(-1)?.values[0].label,
    ).toBe('Studies on Saturday');
    expect(
      preferenceSections({ ...full, studiesOnSaturday: false }).at(-1)?.values[0].label,
    ).toBe('Not on Saturday');
    expect(
      preferenceSections({ ...full, studiesOnSaturday: null }).map((s) => s.heading),
    ).not.toContain('Saturdays');
  });

  it('returns nothing for a student who answered nothing', () => {
    expect(
      preferenceSections({
        preferredTimeBlocks: [],
        studyEnvironments: [],
        studyFormats: [],
        groupSizes: [],
        spokenLanguages: [],
        studiesOnSaturday: null,
      }),
    ).toEqual([]);
  });
});

describe('connectionsSummary', () => {
  it('says nothing when there are none', () => {
    expect(connectionsSummary(0)).toBeNull();
  });

  it('is singular for one', () => {
    expect(connectionsSummary(1)).toBe('Studied with 1 classmate through StudyBuddy');
  });

  it('is plural beyond one', () => {
    expect(connectionsSummary(4)).toBe('Studied with 4 classmates through StudyBuddy');
  });

  it('never implies a denominator', () => {
    /*
     * THE PRIVACY TEST. "3 of 5 partners rated this well" would disclose the two
     * negative ratings the database is protecting. The wording has to be a count of
     * positives only, with nothing to divide it by — a reader must not be able to
     * infer that any negative rating exists.
     */
    for (const count of [1, 3, 12, 99]) {
      const summary = connectionsSummary(count)!;

      expect(summary).not.toMatch(/\bof\b/);
      expect(summary).not.toMatch(/%/);
      expect(summary).not.toMatch(/rating|rated|score|positive|negative/i);
    }
  });
});
