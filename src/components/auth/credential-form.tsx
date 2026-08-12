/**
 * File:        src/components/auth/credential-form.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The email + password form, shared by sign-up and sign-in. One
 *              component for both, because they differ only in wording and in
 *              which action they post to — two near-identical forms would drift
 *              apart the first time either was touched.
 * Version:     0.6.1
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - "Keep me signed in" on the sign-in form (Phase 9A)
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 *     0.6.1 - 2026-08-11 - Added show/hide password toggle and forgot password link
 */

'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';

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
  const [showPassword, setShowPassword] = useState(false);

  /*
   * The email field is CONTROLLED, and that is the whole fix for losing your
   * typing on a failed submit.
   *
   * React 19 resets an uncontrolled form after its action completes, including
   * when the action returned an error. So a student who mistyped their password
   * would find their address wiped too, and have to enter both again. A
   * controlled value comes from React state rather than the DOM, so the reset
   * cannot touch it.
   *
   * The password is deliberately left uncontrolled, so it IS cleared: an
   * incorrect secret is exactly the field that should be retyped, and echoing
   * one back into the markup is not worth doing.
   */
  const [email, setEmail] = useState('');

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
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="student@university.edu"
          aria-invalid={error?.field === 'email' || undefined}
          aria-describedby={error?.field === 'email' ? 'form-error' : undefined}
        />
        {isSignUp ? (
          <p className="text-outline text-label-sm font-normal">
            We will send a confirmation email to this address.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          {!isSignUp ? (
            <Link
              href="/forgot-password"
              className="text-brand text-label-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 rounded-sm"
            >
              Forgot password?
            </Link>
          ) : null}
        </div>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
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
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-outline hover:text-on-surface absolute right-3 top-1/2 -translate-y-1/2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 rounded-sm"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <Eye className="size-4" aria-hidden="true" />
            ) : (
              <EyeOff className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
        {isSignUp ? (
          <p className="text-outline text-label-sm font-normal">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        ) : null}
      </div>

      {!isSignUp ? (
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name="rememberMe"
            defaultChecked
            className="accent-brand size-4"
          />
          <span>
            <span className="block text-label-md">Keep me signed in</span>
            <span className="text-outline block text-label-sm font-normal">
              Leave this off on a shared computer and you will be signed out when the
              browser closes.
            </span>
          </span>
        </label>
      ) : null}

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