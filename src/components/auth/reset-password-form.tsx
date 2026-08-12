/**
 * File:        src/components/auth/reset-password-form.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Setting a new password after following a reset link.
 * Version:     0.23.0
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Initial implementation (Phase 9A)
 */

'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Loader2 } from 'lucide-react';

import { NewPasswordFields } from '@/components/auth/new-password-fields';
import { Button } from '@/components/ui/button';
import { resetPassword } from '@/features/auth/actions';

/**
 * Renders the reset form.
 *
 * @returns The form element.
 */
export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(resetPassword, null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const error = state && !state.ok ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <NewPasswordFields
        errorField={error?.field}
        password={password}
        confirmPassword={confirmPassword}
        onPasswordChange={setPassword}
        onConfirmPasswordChange={setConfirmPassword}
      />

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
        Save new password
      </Button>

      <p className="text-on-surface-variant text-center text-body-md">
        Link stopped working?{' '}
        <Link
          href="/forgot-password"
          className="text-brand focus-visible:ring-brand/35 rounded-sm font-semibold underline underline-offset-4 focus-visible:ring-4 focus-visible:outline-none"
        >
          Ask for a new one
        </Link>
      </p>
    </form>
  );
}
