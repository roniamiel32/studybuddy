/**
 * File:        tests/unit/match-presentation.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Unit tests for how a match is presented. The score itself is
 *              computed in SQL and tested against the database; this covers the
 *              judgement calls made on top of it — which chips are worth showing
 *              and how shared availability is worded.
 * Version:     0.8.0
 *
 * Modifications:
 *     0.8.0 - 2026-08-05 - Initial tests (Phase 2)
 */

import { describe, expect, it } from 'vitest';

import { describeScore, traitChipsFor } from '@/components/matching/traits';
import { formatSharedAvailability } from '@/features/matching/match-view';

describe('formatSharedAvailability', () => {
  it('names the days and the weekly total', () => {
    expect(formatSharedAvailability([0, 2], 360)).toBe('Sun, Tue · 6h a week');
  });

  it('keeps a half hour rather than rounding it away', () => {
    expect(formatSharedAvailability([1], 90)).toBe('Mon · 1.5h a week');
  });

  it('returns null when there is no overlap, so the UI can say so in its own words', () => {
    expect(formatSharedAvailability([], 0)).toBeNull();
    expect(formatSharedAvailability([0], 0)).toBeNull();
  });

  it('orders days as given, which the query already sorts', () => {
    expect(formatSharedAvailability([0, 3, 6], 120)).toBe('Sun, Wed, Sat · 2h a week');
  });
});

describe('traitChipsFor', () => {
  const base = {
    preferredTimeBlocks: ['morning'],
    studyEnvironments: ['quiet'],
    groupSizes: ['small'],
    intent: 'want_partner',
  };

  it('shows a specific time preference', () => {
    const chips = traitChipsFor(base, 4);

    expect(chips.map((chip) => chip.label)).toContain('Early Bird');
  });

  it('omits time entirely when the student picked every block', () => {
    // "Any time" is not a trait, and a chip saying so crowds out ones that mean
    // something.
    const chips = traitChipsFor(
      { ...base, preferredTimeBlocks: ['morning', 'noon', 'evening'] },
      4,
    );

    expect(chips.map((chip) => chip.label)).not.toContain('Early Bird');
    expect(chips.map((chip) => chip.label)).not.toContain('Night Owl');
  });

  it('omits environment when the student is happy with either', () => {
    const chips = traitChipsFor({ ...base, studyEnvironments: ['quiet', 'discussion'] }, 4);

    expect(chips.map((chip) => chip.label)).not.toContain('Quiet Study');
    expect(chips.map((chip) => chip.label)).not.toContain('Discusses Aloud');
  });

  it('always shows what the student wants from the course', () => {
    expect(traitChipsFor({ ...base, intent: 'can_tutor' }, 4).map((c) => c.label)).toContain(
      'Happy to teach',
    );
    expect(traitChipsFor({ ...base, intent: 'need_help' }, 4).map((c) => c.label)).toContain(
      'Wants help',
    );
  });

  it('respects the cap, so a card never overflows', () => {
    expect(traitChipsFor(base, 2)).toHaveLength(2);
    expect(traitChipsFor(base, 1)).toHaveLength(1);
  });

  it('ignores an unrecognised value instead of rendering a blank chip', () => {
    const chips = traitChipsFor({ ...base, intent: 'something_new' }, 4);

    expect(chips.every((chip) => chip.label.length > 0)).toBe(true);
  });
});

describe('describeScore', () => {
  it('describes the band rather than implying precision about people', () => {
    expect(describeScore(85)).toMatch(/strong/i);
    expect(describeScore(60)).toMatch(/good/i);
    expect(describeScore(40)).toMatch(/possible/i);
    expect(describeScore(10)).toMatch(/weak/i);
  });

  it('explains a low score by naming the cause', () => {
    expect(describeScore(10)).toMatch(/schedules do not overlap/i);
  });
});
