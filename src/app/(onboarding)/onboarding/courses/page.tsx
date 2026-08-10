/**
 * File:        src/app/(onboarding)/onboarding/courses/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 2 — the course picker.
 * Version:     0.11.0
 *
 * Modifications:
 *     0.11.0 - 2026-08-09 - Placeholder catalog fallback
 *     0.10.0 - 2026-08-09 - Degree-scoped course read; Smart Course API
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CoursePicker } from '@/components/onboarding/course-picker';
import {
  getDegreeOfferings,
  getDegrees,
  getMyEnrolledOfferingIds,
  getOnboardingProfile,
} from '@/features/onboarding/queries';

export const metadata: Metadata = { title: 'Your courses' };

/**
 * Renders onboarding step 2.
 *
 * @returns The page element.
 */
export default async function OnboardingCoursesPage() {
  const profile = await getOnboardingProfile();

  // The degree drives the course list, so step 1 has to be done first. A
  // student can always type this URL directly.
  if (!profile.degreeId) {
    redirect('/onboarding');
  }

  const [offerings, degrees, enrolled] = await Promise.all([
    getDegreeOfferings(profile.degreeId),
    getDegrees(),
    getMyEnrolledOfferingIds(),
  ]);

  const degreeName =
    degrees.find((degree) => degree.id === profile.degreeId)?.name ?? 'your degree';

  return (
    <>
      <h1 className="font-heading text-headline-lg text-balance">
        Which courses are you taking?
      </h1>
      <p className="text-on-surface-variant mt-2 mb-8 text-body-md text-pretty">
        Every course on your degree this semester, whatever year you are in.
      </p>

      <CoursePicker
        offerings={offerings}
        degreeId={profile.degreeId}
        degreeName={degreeName}
        defaultSelected={enrolled}
      />
    </>
  );
}
