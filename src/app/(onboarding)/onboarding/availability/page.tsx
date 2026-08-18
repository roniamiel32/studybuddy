/**
 * File:        src/app/(onboarding)/onboarding/availability/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 4 — availability, then finish.
 * Version:     0.47.0
 */

import type { Metadata } from 'next';

import { AvailabilityForm } from '@/components/onboarding/availability-form';
import { getCalendarStatus } from '@/features/calendar/queries';
import { getMyAvailability } from '@/features/onboarding/queries';

export const metadata: Metadata = { title: 'When you are free' };

/**
 * Renders onboarding step 4.
 *
 * @returns The page element.
 */
export default async function OnboardingAvailabilityPage() {
  const [slots, calendar] = await Promise.all([getMyAvailability(), getCalendarStatus()]);

  const defaultSelected = slots
    .filter((slot) => slot.source === 'manual')
    .map((slot) => `${slot.day_of_week}|${slot.starts_at.slice(0, 5)}|${slot.ends_at.slice(0, 5)}`);

  return (
    <>
      <h1 className="font-heading text-headline-lg text-balance">
        When are you free?
      </h1>

      <AvailabilityForm defaultSelected={defaultSelected} calendarStatus={calendar} />
    </>
  );
}