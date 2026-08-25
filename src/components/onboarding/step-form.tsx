/**
 * File:        src/components/onboarding/step-form.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Shared wrapper for every onboarding step — owns the action
 *              state, renders server-side errors, and provides the back and
 *              continue controls. Each step then contains only its own
 *              questions.
 * Version:     0.11.0
 *
 * Modifications:
 *     0.11.0 - 2026-08-09 - submitDisabled, so a step can hold Continue closed
 *     0.6.0  - 2026-08-05 - Initial implementation (Phase 1c)
 */

'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import type { ActionResult } from '@/lib/errors';

export interface StepFormProps {
  action: (
    previous: ActionResult<void> | null,
    formData: FormData,
  ) => Promise<ActionResult<void>>;
  submitLabel: string;
  /** Previous step's path. Omitted on step 1, which has nowhere to go back to. */
  backHref?: string;
  variant?: 'default' | 'sunset';
  /**
   * Holds Continue closed while the step's own requirement is unmet.
   *
   * The step still validates on the server — this only saves the round trip and
   * makes the requirement visible before it is broken.
   */
  submitDisabled?: boolean;
  /** Why Continue is closed. Announced, so the reason is not colour-only. */
  submitDisabledReason?: string;
  children: React.ReactNode;
}

/**
 * Renders an onboarding step form.
 *
 * @param action      - The server action for this step.
 * @param submitLabel - Text on the continue button.
 * @param backHref    - Previous step, if any.
 * @param variant              - Button variant; the last step uses the sunset accent.
 * @param submitDisabled       - Holds Continue closed.
 * @param submitDisabledReason - Why, shown next to the button.
 * @param children             - The step's questions.
 * @returns The form element.
 */
export function StepForm({
  action,
  submitLabel,
  backHref,
  variant = 'default',
  submitDisabled = false,
  submitDisabledReason,
  children,
}: StepFormProps) {
  const [state, formAction, pending] = useActionState(action, null);
  const error = state && !state.ok ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-8" noValidate>
      {children}

      {error ? (
        <p
          role="alert"
          className="text-destructive bg-destructive/10 flex items-start gap-2 rounded-md p-3 text-label-md"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {backHref ? (
          <Link
            href={backHref}
            className={buttonVariants({ variant: 'ghost', size: 'lg' })}
          >
            <ArrowLeft />
            Back
          </Link>
        ) : null}

        {/*
          * The reason sits beside the button rather than replacing its label, so
          * a disabled Continue is never a dead control with no explanation.
          */}
        {submitDisabled && submitDisabledReason ? (
          <p id="submit-blocked" className="text-outline text-label-sm ml-auto">
            {submitDisabledReason}
          </p>
        ) : null}

        <Button
          type="submit"
          size="lg"
          variant={variant}
          disabled={pending || submitDisabled}
          aria-describedby={
            submitDisabled && submitDisabledReason ? 'submit-blocked' : undefined
          }
          className={submitDisabled && submitDisabledReason ? undefined : 'ml-auto'}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {submitLabel}
          {pending ? null : <ArrowRight />}
        </Button>
      </div>
    </form>
  );
}
