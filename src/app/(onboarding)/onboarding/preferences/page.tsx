/**
 * File:        src/app/(onboarding)/onboarding/preferences/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 3 — default study preferences.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import type { Metadata } from 'next';

import { PreferencesForm } from '@/components/onboarding/preferences-form';
import { getMyPreferences } from '@/features/onboarding/queries';

export const metadata: Metadata = { title: 'How you study' };

/**
 * Renders onboarding step 3.
 *
 * @returns The page element.
 */
export default async function OnboardingPreferencesPage() {
  const preferences = await getMyPreferences();

  return (
    <>
      <h1 className="font-heading text-headline-lg text-balance">How do you study?</h1>
      <p className="text-on-surface-variant mt-2 mb-8 text-body-md text-pretty">
        Pick everything that applies. These become your defaults, and you will be
        able to override them per course later.
      </p>

      <PreferencesForm
        defaults={{
          preferredTimeBlocks: preferences?.preferred_time_blocks ?? [],
          studyEnvironments: preferences?.study_environments ?? [],
          groupSizes: preferences?.group_sizes ?? [],
          studiesOnSaturday: preferences?.studies_on_saturday ?? null,
          spokenLanguages: preferences?.spoken_languages ?? [],
        }}
      />
    </>
  );
}
