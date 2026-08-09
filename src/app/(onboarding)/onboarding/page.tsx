/**
 * File:        src/app/(onboarding)/onboarding/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 1 — name, study track, year of study.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import type { Metadata } from 'next';

import { BasicsForm } from '@/components/onboarding/basics-form';
import { getOnboardingProfile, getStudyTracks } from '@/features/onboarding/queries';

export const metadata: Metadata = { title: 'About you' };

/**
 * Renders onboarding step 1.
 *
 * @returns The page element.
 */
export default async function OnboardingBasicsPage() {
  const [profile, tracks] = await Promise.all([getOnboardingProfile(), getStudyTracks()]);

  return (
    <>
      <h1 className="font-heading text-headline-lg text-balance">
        First, a little about you
      </h1>
      <p className="text-on-surface-variant mt-2 mb-8 text-body-md text-pretty">
        Three questions. They decide which classmates you are shown and what they
        see when you get in touch.
      </p>

      <BasicsForm
        tracks={tracks}
        universityName={profile.universityName}
        defaults={{
          fullName: profile.fullName,
          studyTrackId: profile.studyTrackId,
          yearOfStudy: profile.yearOfStudy,
        }}
      />
    </>
  );
}
