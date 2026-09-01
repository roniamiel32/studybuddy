/**
 * File:        src/components/onboarding/availability-form.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 4 — the weekly availability grid, and finishing setup.
 * Version:     0.49.0
 *
 * Modifications:
 *     0.49.0 - 2026-09-01 - The Google Calendar sync card is commented out
 *     0.25.0 - 2026-08-13 - Initial implementation
 */

'use client';

/* GOOGLE CALENDAR SYNC UI DISABLED — 2026-09-01. See the note where the card
   used to render, below.

   import { CalendarSyncCard } from '@/components/calendar/calendar-sync-card'; */
import { AvailabilityGrid } from '@/components/onboarding/availability-grid';
import { StepForm } from '@/components/onboarding/step-form';
import { saveAvailabilityAndFinish } from '@/features/onboarding/actions';

export interface AvailabilityFormProps {
  defaultSelected: string[];
  /* Optional while the sync card is commented out — nothing reads it, and the
     page has stopped passing it. Required again when the card comes back. */
  calendarStatus?: any;
}

export function AvailabilityForm({ defaultSelected }: AvailabilityFormProps) {
  return (
    <StepForm
      action={saveAvailabilityAndFinish}
      submitLabel="Finish setup"
      backHref="/onboarding/preferences"
      variant="sunset"
    >
      <div>
        <p className="text-on-surface-variant mt-1 text-body-md">
          Tap the blocks you could study in. Overlapping free time is the single
          biggest factor in a good match — but you can skip this and add it
          later.
        </p>
      </div>
      <div className="-mt-3">
        <AvailabilityGrid
          defaultSelected={defaultSelected}
        />
      </div>

      {/*
        * GOOGLE CALENDAR SYNC DISABLED — 2026-09-01. Signing up no longer offers
        * to connect a Google account: that needs Google's OAuth verification,
        * and a student adds a session to their own calendar from the session
        * dialog instead. Restore this block, the import above, and
        * getCalendarStatus() in the page that renders this form.
        *
        * <div className="-mt-3">
        *   <CalendarSyncCard status={calendarStatus} origin="onboarding" />
        * </div>
        *
        * {calendarStatus.syncEnabled ? (
        *   <p className="bg-surface-container text-on-surface-variant -mt-2 rounded-md p-3 text-label-md">
        *     Your week is coming from Google Calendar. Filling in the grid above switches
        *     back to a hand-drawn week and stops syncing.
        *   </p>
        * ) : null}
        */}
    </StepForm>
  );
}