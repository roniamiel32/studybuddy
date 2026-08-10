/**
 * File:        src/app/(onboarding)/onboarding/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 1 — name, degree level and degree, year of study, city and
 *              date of birth. Choosing a degree is what decides the course list
 *              step 2 fetches.
 * Version:     0.10.0
 *
 * Modifications:
 *     0.10.0 - 2026-08-09 - Step 1 respecified; study track removed
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import type { Metadata } from 'next';

import { BasicsForm } from '@/components/onboarding/basics-form';
import { nameFromEmail } from '@/features/auth/academic-email';
import { getDegrees, getOnboardingProfile } from '@/features/onboarding/queries';

export const metadata: Metadata = { title: 'About you' };

/**
 * Renders onboarding step 1.
 *
 * @returns The page element.
 */
export default async function OnboardingBasicsPage() {
  const [profile, degrees] = await Promise.all([getOnboardingProfile(), getDegrees()]);

  return (
    <>
      <h1 className="font-heading text-headline-lg text-balance">
        First, a little about you
      </h1>
      <p className="text-on-surface-variant mt-2 mb-8 text-body-md text-pretty">
        These decide which classmates you are shown, which course list we fetch,
        and what people see when you get in touch.
      </p>

      <BasicsForm
        degrees={degrees}
        universityName={profile.universityName}
        suggestedName={nameFromEmail(profile.email)}
        defaults={{
          fullName: profile.fullName,
          degreeId: profile.degreeId,
          yearOfStudy: profile.yearOfStudy,
          city: profile.city,
          dateOfBirth: profile.dateOfBirth,
          avatarUrl: profile.avatarUrl,
        }}
      />
    </>
  );
}
