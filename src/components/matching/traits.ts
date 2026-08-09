/**
 * File:        src/components/matching/traits.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Turns stored preference values into the chips shown on a match
 *              card. One mapping in one place, so the same answer never renders
 *              two different ways on two screens.
 * Version:     0.8.0
 *
 * Modifications:
 *     0.8.0 - 2026-08-05 - Initial implementation (Phase 2)
 */

import type { ChipProps } from '@/components/ui/chip';

export interface TraitChip {
  label: string;
  icon: string;
  tone: NonNullable<ChipProps['tone']>;
}

const TIME_BLOCKS: Record<string, TraitChip> = {
  morning: { label: 'Early Bird', icon: '☀️', tone: 'sunset' },
  noon: { label: 'Midday', icon: '🌤️', tone: 'sand' },
  evening: { label: 'Night Owl', icon: '🌙', tone: 'grape' },
};

const ENVIRONMENTS: Record<string, TraitChip> = {
  quiet: { label: 'Quiet Study', icon: '🤫', tone: 'sky' },
  discussion: { label: 'Discusses Aloud', icon: '💬', tone: 'brand' },
};

const GROUP_SIZES: Record<string, TraitChip> = {
  small: { label: 'Small Group', icon: '👥', tone: 'mint' },
  large: { label: 'Big Group', icon: '👨‍👩‍👧‍👦', tone: 'mint' },
};

/** What the student wants from this course, which is what makes a pair click. */
const INTENTS: Record<string, TraitChip> = {
  need_help: { label: 'Wants help', icon: '🙋', tone: 'rose' },
  want_partner: { label: 'Wants a partner', icon: '🤝', tone: 'brand' },
  can_tutor: { label: 'Happy to teach', icon: '🎓', tone: 'mint' },
};

/**
 * Builds the chip list for a candidate.
 *
 * Capped, and ordered by how much each says about compatibility: when a
 * student answers "any time, either environment, any group size", showing six
 * chips communicates less than showing two.
 *
 * @param candidate - The candidate's stored preferences.
 * @param max       - Maximum chips to return.
 * @returns Chips, most informative first.
 */
export function traitChipsFor(
  candidate: {
    preferredTimeBlocks: string[];
    studyEnvironments: string[];
    groupSizes: string[];
    intent: string;
  },
  max = 3,
): TraitChip[] {
  const chips: TraitChip[] = [];

  /*
   * A single answer is a real preference; three answers means "no preference"
   * and is not worth a chip. Only show time-of-day when it narrows something.
   */
  if (candidate.preferredTimeBlocks.length < 3) {
    for (const block of candidate.preferredTimeBlocks) {
      const chip = TIME_BLOCKS[block];
      if (chip) {
        chips.push(chip);
      }
    }
  }

  if (candidate.studyEnvironments.length === 1) {
    const chip = ENVIRONMENTS[candidate.studyEnvironments[0]];
    if (chip) {
      chips.push(chip);
    }
  }

  const intent = INTENTS[candidate.intent];
  if (intent) {
    chips.push(intent);
  }

  if (candidate.groupSizes.length === 1) {
    const chip = GROUP_SIZES[candidate.groupSizes[0]];
    if (chip) {
      chips.push(chip);
    }
  }

  return chips.slice(0, max);
}

/**
 * Describes what the score means, for the tooltip on a score badge.
 *
 * A bare percentage invites the question "out of what?". Naming the band is
 * more honest than implying two-decimal precision about human compatibility.
 *
 * @param score - The rule score, 0-100.
 * @returns A short description.
 */
export function describeScore(score: number): string {
  if (score >= 70) {
    return 'Strong match — your free hours and study habits line up well';
  }
  if (score >= 50) {
    return 'Good match — some overlap in when and how you study';
  }
  if (score >= 30) {
    return 'Possible match — you share a course, but little else lines up yet';
  }
  return 'Weak match — you share a course, but your schedules do not overlap';
}
