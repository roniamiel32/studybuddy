/**
 * File:        src/components/onboarding/availability-form.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 4 — the weekly availability grid, and finishing setup.
 * Version:     0.25.0
 */

'use client';

import { CalendarSyncCard } from '@/components/calendar/calendar-sync-card';
import { AvailabilityGrid } from '@/components/onboarding/availability-grid';
import { StepForm } from '@/components/onboarding/step-form';
import { saveAvailabilityAndFinish } from '@/features/onboarding/actions';

export interface AvailabilityFormProps {
  defaultSelected: string[];
  calendarStatus: any;
}

export function AvailabilityForm({ defaultSelected, calendarStatus }: AvailabilityFormProps) {
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

      <div className="-mt-3">
        <CalendarSyncCard status={calendarStatus} origin="onboarding" />
      </div>

      {calendarStatus.syncEnabled ? (
        <p className="bg-surface-container text-on-surface-variant -mt-2 rounded-md p-3 text-label-md">
          Your week is coming from Google Calendar. Filling in the grid above switches
          back to a hand-drawn week and stops syncing.
        </p>
      ) : null}
    </StepForm>
  );
}