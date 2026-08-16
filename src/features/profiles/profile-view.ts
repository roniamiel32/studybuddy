/**
 * File:        src/features/profiles/profile-view.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The shape of a student profile as the UI consumes it, and the pure
 *              formatting that turns stored answers into readable ones.
 *
 *              WHAT IS DELIBERATELY ABSENT FROM THIS TYPE: anything derived from a
 *              negative rating. The privacy rule is enforced by the SELECT policy in
 *              SQL, and it is repeated here by omission — there is no field a
 *              component could render even if someone tried. A profile cannot leak
 *              what its view model cannot hold.
 *
 *              Kept out of queries.ts because that module is `server-only` and the
 *              rating dialog is a client component.
 * Version:     0.18.0
 *
 * Modifications:
 *     0.18.0 - 2026-08-10 - Initial implementation (Phase 6)
 */

import {
  ENVIRONMENT_OPTIONS,
  GROUP_SIZE_OPTIONS,
  LANGUAGE_OPTIONS,
  STUDY_FORMAT_OPTIONS,
  TIME_BLOCK_OPTIONS,
} from '@/config/onboarding';

/** A course both students are taking. */
export interface SharedCourseView {
  offeringId: string;
  code: string;
  name: string;
}

/** A group both students belong to. */
export interface SharedGroupView {
  id: string;
  name: string;
  memberCount: number;
}

/**
 * A public, positive connection.
 *
 * Only ever built from a positive rating. There is no negative counterpart in this
 * file on purpose.
 */
export interface PositiveConnectionView {
  raterId: string;
  raterName: string;
  raterAvatarUrl: string | null;
  courseCode: string | null;
  ratedAt: string;
}

export interface StudentProfileView {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  /** Whole years, or null when they withheld a date of birth. */
  age: number | null;
  yearOfStudy: number | null;
  degreeName: string | null;
  degreeLevel: string | null;
  universityName: string;
  city: string | null;
  /** Everything the onboarding questionnaire collected. */
  preferredTimeBlocks: string[];
  studyEnvironments: string[];
  studyFormats: string[];
  groupSizes: string[];
  spokenLanguages: string[];
  studiesOnSaturday: boolean | null;
  /** Weekly free hours, summed — the shape of their week without the detail. */
  weeklyFreeHours: number;
  /**
   * The line they have put above their avatar, or null.
   *
   * Never expires and is only ever set by its owner, so this is simply whatever
   * they last chose — there is no freshness to weigh and nothing to recompute.
   */
  statusMessage: string | null;
  /** True when the viewer is looking at their own profile. */
  isSelf: boolean;

  /* ---- Context between the viewer and this student --------------------- */
  sharedCourses: SharedCourseView[];
  sharedGroups: SharedGroupView[];
  /** Best compatibility score across their shared courses, or null. */
  compatibilityScore: number | null;
  /** The course that score came from, so the number can be explained. */
  compatibilityCourseCode: string | null;
  /** Public positive connections, newest first. */
  positiveConnections: PositiveConnectionView[];
  /** Whether the viewer has a conversation with them, which gates rating. */
  canRate: boolean;
  /** The viewer's own rating of this student, if they have given one. */
  myRating: 'positive' | 'negative' | null;
  /**
   * Whether the VIEWER has blocked this student. Never the other way round.
   *
   * Deliberately one-directional. The scorer tests blocks symmetrically so both
   * disappear from each other's matches, but only the person who placed the
   * block can see that it exists — a flag that told somebody they had been
   * blocked would turn a quiet exit into a confrontation.
   */
  isBlocked: boolean;
}

/**
 * Turns stored preference values into the labels a student recognises.
 *
 * @param values  - Stored enum values.
 * @param options - The option list they came from.
 * @returns Readable labels, or an empty array.
 */
export function labelsFor(
  values: string[],
  options: readonly { value: string; label: string; icon?: string }[],
): Array<{ label: string; icon?: string }> {
  return values.map((value) => {
    const option = options.find((candidate) => candidate.value === value);

    return { label: option?.label ?? value, icon: option?.icon };
  });
}

/**
 * The onboarding answers, grouped for display.
 *
 * One place, so the profile and the settings page cannot describe the same answer
 * two different ways.
 *
 * @param profile - The profile being shown.
 * @returns Sections of labelled answers.
 */
export function preferenceSections(
  profile: Pick<
    StudentProfileView,
    | 'preferredTimeBlocks'
    | 'studyEnvironments'
    | 'studyFormats'
    | 'groupSizes'
    | 'spokenLanguages'
    | 'studiesOnSaturday'
  >,
): Array<{ heading: string; values: Array<{ label: string; icon?: string }> }> {
  return [
    {
      heading: 'Prefers to meet',
      values: labelsFor(profile.studyFormats, STUDY_FORMAT_OPTIONS),
    },
    {
      heading: 'Studies',
      values: labelsFor(profile.preferredTimeBlocks, TIME_BLOCK_OPTIONS),
    },
    {
      heading: 'Works best',
      values: labelsFor(profile.studyEnvironments, ENVIRONMENT_OPTIONS),
    },
    {
      heading: 'Group size',
      values: labelsFor(profile.groupSizes, GROUP_SIZE_OPTIONS),
    },
    {
      heading: 'Can study in',
      values: labelsFor(profile.spokenLanguages, LANGUAGE_OPTIONS),
    },
    {
      heading: 'Saturdays',
      values:
        profile.studiesOnSaturday === null
          ? []
          : [{ label: profile.studiesOnSaturday ? 'Studies on Saturday' : 'Not on Saturday' }],
    },
  ].filter((section) => section.values.length > 0);
}

/**
 * The one-line summary under a student's name.
 *
 * @param profile - The profile being shown.
 * @returns A line like "Computer Science · Year 2 · 22".
 */
export function profileSubtitle(
  profile: Pick<StudentProfileView, 'degreeName' | 'yearOfStudy' | 'age'>,
): string {
  return (
    [
      profile.degreeName,
      profile.yearOfStudy ? `Year ${profile.yearOfStudy}` : null,
      /* Age only when they gave a date of birth. An absent one is not "0". */
      profile.age !== null ? `${profile.age}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Classmate'
  );
}

/**
 * How the profile describes its public connections.
 *
 * Worded as sessions rather than as a rating, because that is what a positive
 * rating means and because "3 positive ratings" invites the reader to wonder what
 * the negative count is — a number this product deliberately never shows.
 *
 * @param count - Positive connections received.
 * @returns A short phrase, or null when there are none.
 */
export function connectionsSummary(count: number): string | null {
  if (count <= 0) {
    return null;
  }

  return count === 1
    ? 'Studied with 1 classmate through StudyBuddy'
    : `Studied with ${count} classmates through StudyBuddy`;
}
