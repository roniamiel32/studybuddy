/**
 * File:        src/features/course-wall/course-wall-view.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: View models for the things a course page shows that a profile
 *              does not.
 *
 *              THE POSTS ARE NOT HERE, on purpose. A course post is a wall post
 *              without the sharing, so it reuses WallPostView from the profile
 *              wall rather than getting a near-identical twin — two shapes that
 *              must stay in step, with nothing to notice when they stop, is the
 *              bug this file exists to avoid rather than to create.
 * Version:     0.25.0
 *
 * Modifications:
 *     0.25.0 - 2026-08-13 - Initial implementation (Phase 9C)
 */

export interface CourseMemberView {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  yearOfStudy: number | null;
  degreeName: string | null;
}

export interface CourseTipView {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  canRemove: boolean;
  /** Mean of every rating, 0 when nobody has rated it yet. */
  averageStars: number;
  ratingCount: number;
  /** The viewer's own rating, null when they have not rated it. */
  myStars: number | null;
}

/** The line under a member's name — "Computer Science · Year 2". */
export function memberSubtitle(member: CourseMemberView): string {
  return [member.degreeName, member.yearOfStudy ? `Year ${member.yearOfStudy}` : null]
    .filter(Boolean)
    .join(' · ');
}

/**
 * How a tip's rating reads.
 *
 * SAYS "NOT RATED YET" RATHER THAN "0.0". An unrated tip has no score, and
 * showing it as zero reads as a verdict the class has not given — the one
 * unfair thing a rating system can do to somebody who took the trouble to
 * write something.
 *
 * @param tip - The tip.
 * @returns The label for its rating.
 */
export function ratingSummary(tip: CourseTipView): string {
  if (tip.ratingCount === 0) {
    return 'Not rated yet';
  }

  return `${tip.averageStars.toFixed(1)} · ${tip.ratingCount} ${
    tip.ratingCount === 1 ? 'rating' : 'ratings'
  }`;
}
