/**
 * File:        src/app/(onboarding)/onboarding/courses/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 2 — the course picker.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CoursePicker } from '@/components/onboarding/course-picker';
import {
  getCurrentTermOfferings,
  getMyEnrolledOfferingIds,
  getOnboardingProfile,
  getStudyTracks,
} from '@/features/onboarding/queries';

export const metadata: Metadata = { title: 'Your courses' };

/**
 * Renders onboarding step 2.
 *
 * @returns The page element.
 */
export default async function OnboardingCoursesPage() {
  const profile = await getOnboardingProfile();

  // The track drives the default list, so step 1 has to be done first. A
  // student can always type this URL directly.
  if (!profile.studyTrackId) {
    redirect('/onboarding');
  }

  const [offerings, tracks, enrolled] = await Promise.all([
    getCurrentTermOfferings(),
    getStudyTracks(),
    getMyEnrolledOfferingIds(),
  ]);

  const trackName =
    tracks.find((track) => track.id === profile.studyTrackId)?.name ?? 'Your track';

  return (
    <>
      <h1 className="font-heading text-headline-lg text-balance">
        Which courses are you taking?
      </h1>
      <p className="text-on-surface-variant mt-2 mb-8 text-body-md text-pretty">
        Every course on your track this semester is here, whatever year you are
        in. Taking something outside your track? Search for it.
      </p>

      <CoursePicker
        offerings={offerings}
        studyTrackId={profile.studyTrackId}
        trackName={trackName}
        defaultSelected={enrolled}
      />
    </>
  );
}
