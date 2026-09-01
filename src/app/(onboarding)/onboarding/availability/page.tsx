/**
 * File:        src/app/(onboarding)/onboarding/availability/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 4 — availability, then finish.
 * Version:     0.49.0
 *
 * Modifications:
 *     0.49.0 - 2026-09-01 - The calendar status read goes with the sync card
 *                           commented out of availability-form.tsx
 */

import type { Metadata } from 'next';

import { AvailabilityForm } from '@/components/onboarding/availability-form';
/* import { getCalendarStatus } from '@/features/calendar/queries'; */
import { getMyAvailability } from '@/features/onboarding/queries';

export const metadata: Metadata = { title: 'When you are free' };

/**
 * Renders onboarding step 4.
 *
 * @returns The page element.
 */
export default async function OnboardingAvailabilityPage() {
  /* GOOGLE CALENDAR SYNC DISABLED — 2026-09-01. Restore with the card in
     availability-form.tsx:
     const [slots, calendar] = await Promise.all([getMyAvailability(), getCalendarStatus()]); */
  const slots = await getMyAvailability();

  const defaultSelected = slots
    .filter((slot) => slot.source === 'manual')
    .map((slot) => `${slot.day_of_week}|${slot.starts_at.slice(0, 5)}|${slot.ends_at.slice(0, 5)}`);

  return (
    <>
      <h1 className="font-heading text-headline-lg text-balance">
        When are you free?
      </h1>

      {/* calendarStatus={calendar} goes back on when the sync card does. */}
      <AvailabilityForm defaultSelected={defaultSelected} />
    </>
  );
}