/**
 * File:        src/components/auth/credential-form.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The email + password form, shared by sign-up and sign-in. One
 *              component for both, because they differ only in wording and in
 *              which action they post to — two near-identical forms would drift
 *              apart the first time either was touched.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { AlertCircle, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MIN_PASSWORD_LENGTH } from '@/features/auth/schema';
import type { ActionResult } from '@/lib/errors';

export interface CredentialFormProps {
  mode: 'signup' | 'signin';
  action: (
    previous: ActionResult<void> | null,
    formData: FormData,
  ) => Promise<ActionResult<void>>;
}

/**
 * Renders the credential form and reports server-side validation failures.
 *
 * @param mode   - Which flow this is; changes wording only.
 * @param action - The server action to post to.
 * @returns The form element.
 */
export function CredentialForm({ mode, action }: CredentialFormProps) {
  const [state, formAction, pending] = useActionState(action, null);

  const isSignUp = mode === 'signup';
  const error = state && !state.ok ? state.error : null;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">University email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@post.runi.ac.il"
          aria-invalid={error?.field === 'email' || undefined}
          aria-describedby={error?.field === 'email' ? 'form-error' : undefined}
        />
        {isSignUp ? (
          <p className="text-outline text-label-sm font-normal">
            Your university decides which courses and classmates you see, so it
            has to be your student address.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          /*
           * new-password on sign-up asks the password manager to offer a
           * generated one; current-password on sign-in asks it to fill the
           * saved one. Getting these the wrong way round is a common and
           * annoying bug.
           */
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          required
          minLength={isSignUp ? MIN_PASSWORD_LENGTH : undefined}
          aria-invalid={error?.field === 'password' || undefined}
          aria-describedby={error?.field === 'password' ? 'form-error' : undefined}
        />
        {isSignUp ? (
          <p className="text-outline text-label-sm font-normal">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        ) : null}
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
        {isSignUp ? 'Create account' : 'Sign in'}
      </Button>

      <p className="text-on-surface-variant text-center text-body-md">
        {isSignUp ? 'Already have an account? ' : 'New to StudyBuddy? '}
        <Link
          href={isSignUp ? '/login' : '/signup'}
          className="text-brand focus-visible:ring-brand/35 rounded-sm font-semibold underline underline-offset-4 focus-visible:ring-4 focus-visible:outline-none"
        >
          {isSignUp ? 'Sign in' : 'Create one'}
        </Link>
      </p>
    </form>
  );
}
