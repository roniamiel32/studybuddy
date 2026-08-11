/**
 * File:        src/components/onboarding/availability-form.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 4 — the weekly availability grid, and finishing setup.
 *
 *              Decision D7 promises a choice between filling this in by hand
 *              and syncing a calendar. The sync itself is Phase 4c, so the
 *              option is shown here as visibly unavailable rather than hidden:
 *              a student who would rather sync should know it is coming, and
 *              hiding it would make the promise invisible.
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - Grid moved to AvailabilityGrid, shared with the
 *                           Profile tab
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

'use client';

import { CalendarSync } from 'lucide-react';

import { AvailabilityGrid } from '@/components/onboarding/availability-grid';
import { StepForm } from '@/components/onboarding/step-form';
import { saveAvailabilityAndFinish } from '@/features/onboarding/actions';

export interface AvailabilityFormProps {
  /** Slots already saved, encoded as `day|start|end`. */
  defaultSelected: string[];
}

/**
 * Renders the step 4 grid and the finish control.
 *
 * @param defaultSelected - Previously saved slots.
 * @returns The form element.
 */
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

      <AvailabilityGrid
        defaultSelected={defaultSelected}
        emptyHint="You can finish without this and fill it in from settings."
      />

      <div className="border-outline-variant/60 flex items-start gap-3 rounded-md border border-dashed p-4">
        <CalendarSync className="text-outline mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-label-md">Sync a calendar instead</p>
          <p className="text-outline mt-1 text-label-sm font-normal">
            Connecting Google Calendar to fill this in automatically. Only your free/busy times would be read — never event titles
            or details.
          </p>
        </div>
      </div>
    </StepForm>
  );
}
