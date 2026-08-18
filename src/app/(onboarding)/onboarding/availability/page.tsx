/**
 * File:        src/app/(onboarding)/onboarding/availability/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 4 — availability, then finish.
 * Version:     0.46.0
 *
 * Modifications:
 *     0.6.0  - 2026-08-05 - Initial implementation (Phase 1c)
 *     0.46.0 - 2026-08-18 - Google Calendar card above the grid
 */

import type { Metadata } from 'next';

import { CalendarSyncCard } from '@/components/calendar/calendar-sync-card';
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
        When are you free?
      </h1>
      

      {/*
        * Above the grid, because it is the faster route: a student who connects
        * their calendar does not need to draw anything. The grid stays available
        * underneath — connecting is opt-in, and drawing the week by hand has to
        * remain a complete answer.
        */}
      <div className="mb-6">
        <CalendarSyncCard status={calendar} origin="onboarding" />
      </div>

      {calendar.syncEnabled ? (
        <p className="bg-surface-container text-on-surface-variant mb-6 rounded-md p-3 text-label-md">
          Your week is coming from Google Calendar. Filling in the grid below switches
          back to a hand-drawn week and stops syncing.
        </p>
      ) : null}

      <AvailabilityForm defaultSelected={defaultSelected} />
    </>
  );
}
