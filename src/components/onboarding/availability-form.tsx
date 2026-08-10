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
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

'use client';

import { useState } from 'react';
import { CalendarSync } from 'lucide-react';

import { StepForm } from '@/components/onboarding/step-form';
import { Chip } from '@/components/ui/chip';
import { TIME_SLOTS, WEEKDAYS } from '@/config/onboarding';
import { saveAvailabilityAndFinish } from '@/features/onboarding/actions';
import { cn } from '@/lib/utils';

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
  const [selected, setSelected] = useState<string[]>(defaultSelected);

  const toggle = (key: string) => {
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const hours = selected.length * 2;

  return (
    <StepForm
      action={saveAvailabilityAndFinish}
      submitLabel="Finish setup"
      backHref="/onboarding/preferences"
      variant="sunset"
    >
      {selected.map((slot) => (
        <input key={slot} type="hidden" name="slots" value={slot} />
      ))}

      <div>
        <p className="text-on-surface-variant mt-1 text-body-md">
          Tap the blocks you could study in. Overlapping free time is the single
          biggest factor in a good match — but you can skip this and add it
          later.
        </p>
      </div>

      {/* Horizontal scroll on narrow screens rather than a cramped grid: seven
          columns cannot fit a phone legibly, and shrinking them makes the
          targets too small to tap accurately. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        <table className="w-full min-w-[34rem] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-16" />
              {WEEKDAYS.map((day) => (
                <th
                  key={day.value}
                  scope="col"
                  className="text-on-surface-variant pb-1 text-label-sm"
                >
                  <abbr title={day.label} className="no-underline">
                    {day.short}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map((slot) => (
              <tr key={slot.start}>
                <th
                  scope="row"
                  className="text-outline pr-2 text-right text-label-sm font-normal"
                >
                  {slot.label}
                </th>
                {WEEKDAYS.map((day) => {
                  const key = `${day.value}|${slot.start}|${slot.end}`;
                  const isOn = selected.includes(key);

                  return (
                    <td key={key}>
                      <button
                        type="button"
                        onClick={() => toggle(key)}
                        aria-pressed={isOn}
                        aria-label={`${day.label} ${slot.label}`}
                        className={cn(
                          'h-9 w-full rounded-sm border transition-colors',
                          'focus-visible:ring-brand/35 focus-visible:ring-4 focus-visible:outline-none',
                          isOn
                            ? 'border-brand bg-brand'
                            : 'border-outline-variant/50 bg-white hover:bg-brand-fixed/60',
                        )}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={hours > 0 ? 'brand' : 'neutral'}>{hours} hours a week</Chip>
        {hours === 0 ? (
          <span className="text-outline text-label-sm">
            You can finish without this and fill it in from settings.
          </span>
        ) : null}
      </div>

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
