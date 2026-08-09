/**
 * File:        src/components/onboarding/stepper.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Progress indicator for the four-step flow, following the Stitch
 *              design: "Step 2 of 4" on the left, the step's name on the right,
 *              and a filled bar between. Knowing how much is left is what stops
 *              a multi-step form feeling endless.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

'use client';

import { usePathname } from 'next/navigation';

import { ONBOARDING_STEPS } from '@/config/onboarding';

/**
 * Renders the onboarding progress bar.
 *
 * @returns The stepper element.
 */
export function OnboardingStepper() {
  const pathname = usePathname();

  /*
   * Longest match wins. A plain startsWith would match "/onboarding" against
   * every step, since all four paths begin with it.
   */
  const currentIndex = ONBOARDING_STEPS.reduce((best, step, index) => {
    const matches = pathname === step.path || pathname.startsWith(`${step.path}/`);
    return matches && step.path.length >= ONBOARDING_STEPS[best].path.length ? index : best;
  }, 0);

  const step = ONBOARDING_STEPS[currentIndex];
  const percent = ((currentIndex + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-on-surface-variant text-label-md">
          Step {currentIndex + 1} of {ONBOARDING_STEPS.length}
        </p>
        <p className="text-brand text-label-md">{step.label}</p>
      </div>

      <div
        className="bg-surface-container-highest h-2 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={currentIndex + 1}
        aria-valuemin={1}
        aria-valuemax={ONBOARDING_STEPS.length}
        aria-label="Onboarding progress"
      >
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-brand-bright),var(--color-brand))] transition-[width] duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
