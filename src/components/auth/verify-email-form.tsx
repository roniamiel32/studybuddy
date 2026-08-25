/**
 * File:        src/components/auth/verify-email-form.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The six-digit code from the sign-up email.
 *
 *              ONE INPUT, NOT SIX BOXES. Six separate inputs look the part and
 *              then fight everything that makes a code usable: pasting the whole
 *              thing, a password manager filling it, backspacing across a
 *              boundary, and a screen reader announcing "edit, blank" six times.
 *              A single field with inputMode="numeric" and autocomplete
 *              one-time-code gets the phone keyboard and the iOS autofill
 *              suggestion for free.
 * Version:     0.23.0
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Initial implementation (Phase 9A)
 */

'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, Loader2, MailCheck, RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { resendVerificationCode, verifyEmailCode } from '@/features/auth/actions';

export interface VerifyEmailFormProps {
  /** The address the code went to, carried through from sign-up. */
  email: string;
}

/**
 * Renders the code form and the resend control.
 *
 * @param email - The address awaiting confirmation.
 * @returns The form element.
 */
export function VerifyEmailForm({ email }: VerifyEmailFormProps) {
  const [state, formAction, pending] = useActionState(verifyEmailCode, null);
  const [resendState, resendAction, resending] = useActionState(resendVerificationCode, null);
  const [code, setCode] = useState('');

  const error = state && !state.ok ? state.error : null;
  const resendError = resendState && !resendState.ok ? resendState.error : null;

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="email" value={email} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            name="code"
            /* text, not number: a number input strips leading zeros, and a code
               beginning 0 is one in ten of them. */
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            required
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456"
            aria-invalid={error?.field === 'code' || undefined}
            aria-describedby={error ? 'form-error' : undefined}
            className="text-center text-headline-md tracking-[0.4em]"
          />
        </div>

        {error ? (
          <p
            id="form-error"
            role="alert"
            className="text-destructive bg-destructive/10 flex items-start gap-2 rounded-md p-3 text-label-md"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error.message}
          </p>
        ) : null}

        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Confirm my account
        </Button>
      </form>

      {/*
        A second form rather than a second button in the first one: submitting
        the resend must not carry — or validate — whatever half-typed code is
        sitting in the field.
      */}
      <form action={resendAction} className="flex flex-col gap-2">
        <input type="hidden" name="email" value={email} />

        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-on-surface-variant text-body-md">Nothing arrived?</span>
          <button
            type="submit"
            disabled={resending}
            className="text-brand hover:text-brand focus-visible:ring-brand/35 inline-flex items-center gap-1.5 rounded-sm text-label-md font-semibold underline underline-offset-4 focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
          >
            {resending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCw className="size-3.5" aria-hidden="true" />
            )}
            Send a new code
          </button>
        </div>

        {resendState?.ok ? (
          <p
            role="status"
            className="text-brand flex items-center justify-center gap-1.5 text-label-sm font-normal"
          >
            <MailCheck className="size-3.5" aria-hidden="true" />
            A new code is on its way.
          </p>
        ) : null}

        {resendError ? (
          <p role="alert" className="text-destructive text-center text-label-sm font-normal">
            {resendError.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}
