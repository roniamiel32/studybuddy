/**
 * File:        src/components/profile/change-password-form.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Changing your password from inside the app.
 *
 *              THE CURRENT PASSWORD IS ASKED FOR, and it is not a formality:
 *              Supabase will rewrite the password of whoever holds the session,
 *              so without this field a borrowed laptop is enough to take an
 *              account for good. The server checks it — see auth/actions.ts.
 * Version:     0.23.0
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Initial implementation (Phase 9A)
 */

'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, Check, Eye, EyeOff, Loader2 } from 'lucide-react';

import { NewPasswordFields } from '@/components/auth/new-password-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { changePassword } from '@/features/auth/actions';

/**
 * Renders the change-password section.
 *
 * @returns The section element.
 */
export function ChangePasswordForm() {
  const [showCurrent, setShowCurrent] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  /*
   * The action is wrapped so the fields can be emptied the moment it succeeds.
   * Doing it here rather than in an effect keeps it to one render, and keeps a
   * new password from sitting in the DOM after it has been saved. The current
   * password field is uncontrolled, so React 19 clears that one itself.
   */
  const [state, formAction, pending] = useActionState(
    async (previous: Awaited<ReturnType<typeof changePassword>> | null, formData: FormData) => {
      const result = await changePassword(previous, formData);

      if (result.ok) {
        setPassword('');
        setConfirmPassword('');
      }

      return result;
    },
    null,
  );

  const error = state && !state.ok ? state.error : null;

  return (
    <section aria-labelledby="password-heading" className="clay-card p-6">
      <h2 id="password-heading" className="font-heading text-headline-md">
        Change password
      </h2>
      <p className="text-on-surface-variant mt-1 mb-4 text-body-md text-pretty">
        You will stay signed in here. Anywhere else you are signed in stays signed in
        too — sign out from those devices if that is not what you want.
      </p>

      <form action={formAction} className="flex max-w-md flex-col gap-5" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="currentPassword">Current password</Label>
          <div className="relative">
            <Input
              id="currentPassword"
              name="currentPassword"
              type={showCurrent ? 'text' : 'password'}
              autoComplete="current-password"
              required
              aria-invalid={error?.field === 'currentPassword' || undefined}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="text-outline hover:text-on-surface focus-visible:ring-brand/35 absolute top-1/2 right-3 -translate-y-1/2 rounded-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
              aria-label={showCurrent ? 'Hide password' : 'Show password'}
            >
              {showCurrent ? (
                <Eye className="size-4" aria-hidden="true" />
              ) : (
                <EyeOff className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

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

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Update password
          </Button>

          {state?.ok ? (
            <p
              role="status"
              className="text-brand flex items-center gap-1.5 text-label-md"
            >
              <Check className="size-4" aria-hidden="true" />
              Password updated.
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
