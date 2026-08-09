/**
 * File:        src/app/(onboarding)/onboarding/availability/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 4 — availability, then finish.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import type { Metadata } from 'next';

import { AvailabilityForm } from '@/components/onboarding/availability-form';
import { getMyAvailability } from '@/features/onboarding/queries';

export const metadata: Metadata = { title: 'When you are free' };

/**
 * Renders onboarding step 4.
 *
 * @returns The page element.
 */
export default async function OnboardingAvailabilityPage() {
  const slots = await getMyAvailability();

  /*
   * PostgreSQL returns `time` as "08:00:00"; the grid keys on "08:00". Only
   * manual slots are editable here — synced ones are owned by the calendar
   * integration and must not be silently rewritten by this form.
   */
  const defaultSelected = slots
    .filter((slot) => slot.source === 'manual')
    .map((slot) => `${slot.day_of_week}|${slot.starts_at.slice(0, 5)}|${slot.ends_at.slice(0, 5)}`);

  return (
    <>
      <h1 className="font-heading text-headline-lg text-balance">
        When could you study?
      </h1>
      <p className="text-on-surface-variant mt-2 mb-8 text-body-md text-pretty">
        Rough blocks are fine. We only use these to find hours you and a partner
        both have free.
      </p>

      <AvailabilityForm defaultSelected={defaultSelected} />
    </>
  );
}
