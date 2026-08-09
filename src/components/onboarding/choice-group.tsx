/**
 * File:        src/components/onboarding/choice-group.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Selectable option cards for the preference questions, in both
 *              multi-select and single-select flavours.
 *
 *              Built on real checkboxes and radios rather than buttons with
 *              ARIA. The native controls already give keyboard support, group
 *              semantics and form submission for free, and the visible card is
 *              just a styled label — which is far harder to get wrong than
 *              re-implementing all of that on a <div>.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

'use client';

import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface ChoiceOption {
  value: string;
  label: string;
  hint?: string;
  icon?: string;
}

export interface ChoiceGroupProps {
  /** Form field name. Repeated per selection when multi-select. */
  name: string;
  legend: string;
  description?: string;
  options: readonly ChoiceOption[];
  multiple?: boolean;
  defaultValue?: readonly string[];
  columns?: 1 | 2;
}

/**
 * Renders a labelled group of selectable option cards.
 *
 * @param name         - Form field name.
 * @param legend       - The question, rendered as the fieldset legend.
 * @param description  - Optional helper line under the question.
 * @param options      - The choices.
 * @param multiple     - True for checkboxes, false for radios.
 * @param defaultValue - Values selected on first render.
 * @param columns      - Grid columns at desktop width.
 * @returns The fieldset element.
 */
export function ChoiceGroup({
  name,
  legend,
  description,
  options,
  multiple = true,
  defaultValue = [],
  columns = 2,
}: ChoiceGroupProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="font-heading text-body-lg font-semibold">{legend}</legend>
      {description ? (
        <p className="text-on-surface-variant mt-1 text-body-md">{description}</p>
      ) : null}

      <div
        className={cn(
          'mt-4 grid gap-3',
          columns === 2 ? 'sm:grid-cols-2' : 'grid-cols-1',
        )}
      >
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'group border-outline-variant/60 relative flex cursor-pointer items-start gap-3 rounded-md border bg-white p-4 transition-colors',
              'hover:border-brand/60',
              /*
               * has-checked styles the card from the input's own state, so the
               * selected look can never disagree with what will be submitted —
               * which is exactly what happens when selection is mirrored into
               * React state.
               */
              'has-checked:border-brand has-checked:bg-brand-fixed/50',
              'has-focus-visible:ring-brand/35 has-focus-visible:ring-4',
            )}
          >
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={name}
              value={option.value}
              defaultChecked={defaultValue.includes(option.value)}
              className="peer sr-only"
            />

            <span
              aria-hidden="true"
              className="border-outline-variant text-brand mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm border bg-white peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white"
            >
              <Check className="size-3.5 opacity-0 peer-checked:opacity-100 group-has-checked:opacity-100" />
            </span>

            <span className="min-w-0">
              <span className="text-label-md flex items-center gap-1.5">
                {option.icon ? (
                  <span aria-hidden="true" className="text-base leading-none">
                    {option.icon}
                  </span>
                ) : null}
                {option.label}
              </span>
              {option.hint ? (
                <span className="text-outline mt-0.5 block text-label-sm font-normal">
                  {option.hint}
                </span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
