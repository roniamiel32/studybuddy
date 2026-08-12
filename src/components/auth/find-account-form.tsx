/**
 * File:        src/components/auth/find-account-form.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Find your account" — the one field standing between a forgotten
 *              password and an email.
 *
 *              THE SUCCESS SCREEN DOES NOT SAY WHETHER THE ACCOUNT EXISTS, and
 *              that is the point of showing a screen rather than a message. The
 *              copy is true for an address with an account and for one without,
 *              so nobody can sit here typing classmates' addresses to find out
 *              who has registered.
 * Version:     0.23.0
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Initial implementation (Phase 9A)
 */

'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Loader2, MailCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestPasswordReset } from '@/features/auth/actions';

/**
 * Renders the "find your account" form, or the confirmation once it is sent.
 *
 * @returns The form element.
 */
export function FindAccountForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, null);
  /* Controlled for the same reason the login form is: React 19 clears an
     uncontrolled form after the action runs, error or not. */
  const [email, setEmail] = useState('');

  const error = state && !state.ok ? state.error : null;

  if (state?.ok) {
    return (
      <div className="flex flex-col gap-5">
        <span className="bg-brand-fixed/60 text-brand flex size-12 items-center justify-center rounded-full">
          <MailCheck className="size-6" aria-hidden="true" />
        </span>

        <div>
          <h1 className="font-heading text-headline-lg">Check your email</h1>
          <p className="text-on-surface-variant mt-2 text-body-md text-pretty">
            If {email} has an account, a link to reset your password is on its way. It
            expires in an hour.
          </p>
        </div>

        <p className="text-outline text-label-sm font-normal text-pretty">
          Nothing arrived? Check your spam folder, or make sure you used your university
          address.
        </p>

        <Link
          href="/login"
          className="text-brand focus-visible:ring-brand/35 inline-flex items-center gap-1.5 rounded-sm text-label-md font-semibold focus-visible:ring-4 focus-visible:outline-none"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-heading text-headline-lg">Find your account</h1>
      <p className="text-on-surface-variant mt-2 mb-7 text-body-md text-pretty">
        Enter the university address you signed up with and we will send you a link to
        set a new password.
      </p>

      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">University email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="student@university.edu"
            aria-invalid={error?.field === 'email' || undefined}
            aria-describedby={error ? 'form-error' : undefined}
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
          Send reset link
        </Button>

        <p className="text-on-surface-variant text-center text-body-md">
          Remembered it?{' '}
          <Link
            href="/login"
            className="text-brand focus-visible:ring-brand/35 rounded-sm font-semibold underline underline-offset-4 focus-visible:ring-4 focus-visible:outline-none"
          >
            Sign in
          </Link>
        </p>
      </form>
    </>
  );
}
