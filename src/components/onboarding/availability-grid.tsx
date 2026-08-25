/**
 * File:        src/components/onboarding/availability-grid.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The weekly availability grid, on its own.
 *
 *              Extracted from onboarding step 4 so the Profile tab can edit the
 *              same week without a second copy of it. It owns the selection and
 *              emits one hidden input per selected slot, so any <form> can wrap
 *              it and any action can read `slots` the same way.
 *
 *              It deliberately knows nothing about how it is submitted: step 4
 *              finishes onboarding, the Profile tab saves and closes a dialog,
 *              and neither of those belongs to a grid of buttons.
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - Extracted from availability-form (Phase 4)
 */

'use client';

import { useState } from 'react';

import { Chip } from '@/components/ui/chip';
import { TIME_SLOTS, WEEKDAYS } from '@/config/onboarding';
import { cn } from '@/lib/utils';

export interface AvailabilityGridProps {
  /** Slots already saved, encoded as `day|start|end`. */
  defaultSelected: string[];
  /** Field name for the hidden inputs, repeated once per selected slot. */
  name?: string;
  /** Shown beside the hours chip while nothing is selected. */
  emptyHint?: string;
}

/**
 * Renders the tappable weekly grid and the hours it adds up to.
 *
 * @param defaultSelected - Previously saved slots.
 * @param name            - Field name carrying the selection to the action.
 * @param emptyHint       - What to say when the week is still empty.
 * @returns The grid element.
 */
export function AvailabilityGrid({
  defaultSelected,
  name = 'slots',
  emptyHint,
}: AvailabilityGridProps) {
  const [selected, setSelected] = useState<string[]>(defaultSelected);

  const toggle = (key: string) => {
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const hours = selected.length * 2;

  return (
    <>
      {selected.map((slot) => (
        <input key={slot} type="hidden" name={name} value={slot} />
      ))}

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
        {hours === 0 && emptyHint ? (
          <span className="text-outline text-label-sm">{emptyHint}</span>
        ) : null}
      </div>
    </>
  );
}
