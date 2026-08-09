/**
 * File:        tests/unit/onboarding-schema.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Unit tests for onboarding validation. These rules are what the
 *              server actually enforces, so the tests cover the rejections as
 *              carefully as the happy paths — a form can be bypassed, a schema
 *              cannot.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial tests (Phase 1c)
 */

import { describe, expect, it } from 'vitest';

import {
  availabilitySchema,
  basicsSchema,
  coursesSchema,
  preferencesSchema,
} from '@/features/onboarding/schema';
import { emailDomain, signUpSchema } from '@/features/auth/schema';

const TRACK_ID = '7ac00001-0000-4000-8000-000000000001';
const OFFERING_ID = 'c0000001-0000-4000-8000-000000000001';

describe('signUpSchema', () => {
  it('normalises the address, so casing and stray spaces cannot fork an account', () => {
    const parsed = signUpSchema.parse({
      email: '  Roni@Post.RUNI.ac.il ',
      password: 'longenough1',
    });

    expect(parsed.email).toBe('roni@post.runi.ac.il');
  });

  it('rejects a password shorter than the project minimum', () => {
    expect(() => signUpSchema.parse({ email: 'a@post.runi.ac.il', password: 'short' })).toThrow();
  });
});

describe('emailDomain', () => {
  it('extracts the domain used to resolve the institution', () => {
    expect(emailDomain('Roni@Post.RUNI.ac.il')).toBe('post.runi.ac.il');
  });

  it('returns empty for a malformed address rather than throwing', () => {
    expect(emailDomain('not-an-address')).toBe('');
  });
});

describe('basicsSchema', () => {
  it('accepts a complete step 1', () => {
    const parsed = basicsSchema.parse({
      fullName: '  Roni Amiel  ',
      studyTrackId: TRACK_ID,
      yearOfStudy: '3',
    });

    expect(parsed.fullName).toBe('Roni Amiel');
    expect(parsed.yearOfStudy).toBe(3);
  });

  it('accepts year 8, because extended degrees are real', () => {
    expect(() =>
      basicsSchema.parse({ fullName: 'Ada', studyTrackId: TRACK_ID, yearOfStudy: 8 }),
    ).not.toThrow();
  });

  it('rejects a year outside 1-8', () => {
    expect(() =>
      basicsSchema.parse({ fullName: 'Ada', studyTrackId: TRACK_ID, yearOfStudy: 9 }),
    ).toThrow();
  });

  it('rejects a track that is not a uuid, which a tampered form would send', () => {
    expect(() =>
      basicsSchema.parse({ fullName: 'Ada', studyTrackId: 'computer-science', yearOfStudy: 1 }),
    ).toThrow();
  });
});

describe('coursesSchema', () => {
  it('requires at least one course, since every match is anchored to one', () => {
    expect(() => coursesSchema.parse({ offeringIds: [] })).toThrow();
  });

  it('removes duplicates, which would violate the unique constraint on enrollments', () => {
    const parsed = coursesSchema.parse({ offeringIds: [OFFERING_ID, OFFERING_ID] });

    expect(parsed.offeringIds).toEqual([OFFERING_ID]);
  });
});

describe('preferencesSchema', () => {
  const valid = {
    preferredTimeBlocks: ['morning', 'evening'],
    studyEnvironments: ['quiet'],
    groupSizes: ['small'],
    studiesOnSaturday: false,
    spokenLanguages: ['he', 'en'],
  };

  it('accepts several times of day at once', () => {
    const parsed = preferencesSchema.parse(valid);

    expect(parsed.preferredTimeBlocks).toEqual(['morning', 'evening']);
  });

  it('requires at least one answer per question', () => {
    expect(() => preferencesSchema.parse({ ...valid, preferredTimeBlocks: [] })).toThrow();
    expect(() => preferencesSchema.parse({ ...valid, studyEnvironments: [] })).toThrow();
    expect(() => preferencesSchema.parse({ ...valid, groupSizes: [] })).toThrow();
    expect(() => preferencesSchema.parse({ ...valid, spokenLanguages: [] })).toThrow();
  });

  it('rejects a value outside the enum', () => {
    expect(() =>
      preferencesSchema.parse({ ...valid, preferredTimeBlocks: ['midnight'] }),
    ).toThrow();
  });

  it('deduplicates repeated selections', () => {
    const parsed = preferencesSchema.parse({
      ...valid,
      spokenLanguages: ['he', 'he', 'en'],
    });

    expect(parsed.spokenLanguages).toEqual(['he', 'en']);
  });

  it('treats Saturday as a required boolean, not an optional flag', () => {
    const withoutSaturday: Record<string, unknown> = { ...valid };
    delete withoutSaturday.studiesOnSaturday;

    expect(() => preferencesSchema.parse(withoutSaturday)).toThrow();
  });
});

describe('availabilitySchema', () => {
  it('allows an empty grid, so a student is never trapped on step 4', () => {
    expect(availabilitySchema.parse({ slots: [] }).slots).toEqual([]);
  });

  it('accepts a well-formed slot', () => {
    const parsed = availabilitySchema.parse({
      slots: [{ dayOfWeek: '0', startsAt: '10:00', endsAt: '12:00' }],
    });

    expect(parsed.slots[0].dayOfWeek).toBe(0);
  });

  it('rejects a slot that ends before it starts', () => {
    expect(() =>
      availabilitySchema.parse({
        slots: [{ dayOfWeek: 1, startsAt: '14:00', endsAt: '10:00' }],
      }),
    ).toThrow();
  });

  it('rejects a day outside the week', () => {
    expect(() =>
      availabilitySchema.parse({
        slots: [{ dayOfWeek: 7, startsAt: '10:00', endsAt: '12:00' }],
      }),
    ).toThrow();
  });

  it('rejects a malformed time', () => {
    expect(() =>
      availabilitySchema.parse({
        slots: [{ dayOfWeek: 1, startsAt: '10am', endsAt: '12:00' }],
      }),
    ).toThrow();
  });
});
