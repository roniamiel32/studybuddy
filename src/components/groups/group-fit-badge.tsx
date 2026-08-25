/**
 * File:        src/components/groups/group-fit-badge.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: How well one student fits a group, as a percentage in the same
 *              three colours the profile screen uses for a match.
 *
 *              ONE COMPONENT FOR BOTH SIDES OF THE SAME DECISION. The founder
 *              sees it on a join request; the student sees it on the group card
 *              before they ask. It is the same number from the same function,
 *              and it has to look the same in both places — a badge that read
 *              green while browsing and orange once you had applied would be
 *              worse than no badge at all.
 *
 *              NULL RENDERS NOTHING. A score that could not be worked out —
 *              nobody in the group has filled in their week, say — must not
 *              appear as a very bad one, and a grey "?" would only invite the
 *              reader to wonder whether it meant zero.
 *
 *              THE TITLE SAYS WHAT IT IS MEASURED AGAINST, because a percentage
 *              beside a name or a group reads as "this much like me" and this is
 *              not that: it is the share of the hours the group ALREADY shares
 *              that the student can also make, blended with how closely their
 *              study habits match the members.
 * Version:     0.41.0
 *
 * Modifications:
 *     0.41.0 - 2026-08-17 - Extracted from applicant-review-dialog so the group
 *                           card can show the same badge (Phase 11C)
 */

import { getCompatibilityColor } from '@/components/matching/traits';
import { cn } from '@/lib/utils';

export interface GroupFitBadgeProps {
  /** 0-100, or null when it could not be worked out. */
  score: number | null;
  /** What the number is about, for the tooltip. */
  subject?: 'applicant' | 'group';
  className?: string;
}

/**
 * Renders the fit percentage.
 *
 * @returns The badge, or nothing when there is no score.
 */
export function GroupFitBadge({ score, subject = 'applicant', className }: GroupFitBadgeProps) {
  if (score === null) {
    return null;
  }

  const rounded = Math.round(score);

  const title =
    subject === 'group'
      ? `${rounded}% fit with this group — how much of the hours its members already share you can also make, and how closely your study habits match theirs`
      : `${rounded}% fit with this group — how much of the group's shared free time they can make, and how closely their study habits match the members`;

  return (
    <span
      title={title}
      className={cn(
        'border-outline-variant/50 shrink-0 rounded-full border bg-white px-2 py-0.5',
        'text-label-sm shadow-sm',
        className,
      )}
      style={{ color: getCompatibilityColor(rounded) }}
    >
      {rounded}%
    </span>
  );
}
