/**
 * File:        src/features/matching/match-view.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The shape of a match as the UI consumes it, plus the pure
 *              formatting that goes with it.
 *
 *              Kept separate from queries.ts on purpose. That module is marked
 *              `server-only` because it reads cookies, so a client component
 *              importing a type from it drags `next/headers` into the browser
 *              bundle and the build fails. Types and pure functions live here
 *              where both sides can reach them.
 * Version:     0.48.0
 *
 * Modifications:
 *     0.48.0 - 2026-08-19 - Shared courses are named, not coded
 *     0.10.0 - 2026-08-09 - track_name dropped from the view model
 *     0.8.0 - 2026-08-05 - Split out of queries.ts (Phase 2)
 */

import { WEEKDAYS } from '@/config/onboarding';

export interface MatchView {
  candidateId: string;
  fullName: string;
  avatarUrl: string | null;
  degreeName: string | null;
  yearOfStudy: number | null;
  score: number;
  overlapMinutes: number;
  sharedDays: number[];
  /** Courses both students are taking, named, best-scoring first. */
  sharedCourseNames: string[];
  /** The course this candidate scored highest on. */
  bestCourseName: string;
  bestCourseOfferingId: string;
  preferredTimeBlocks: string[];
  studyEnvironments: string[];
  groupSizes: string[];
  studiesOnSaturday: boolean;
  intent: string;
}

/**
 * Formats shared availability as something a student can act on.
 *
 * "Sun, Tue · 6h a week" beats "360 minutes": the days are what you use to
 * arrange a session.
 *
 * @param sharedDays     - Weekday numbers, Sunday = 0.
 * @param overlapMinutes - Total overlapping minutes per week.
 * @returns A display string, or null when there is no overlap at all.
 */
export function formatSharedAvailability(
  sharedDays: number[],
  overlapMinutes: number,
): string | null {
  if (sharedDays.length === 0 || overlapMinutes === 0) {
    return null;
  }

  const days = sharedDays
    .map((day) => WEEKDAYS.find((weekday) => weekday.value === day)?.short)
    .filter(Boolean)
    .join(', ');

  const hours = Math.round((overlapMinutes / 60) * 10) / 10;

  return `${days} · ${hours}h a week`;
}
