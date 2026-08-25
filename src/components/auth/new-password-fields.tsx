/**
 * File:        src/components/auth/new-password-fields.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: A new password, typed twice, with the show/hide toggle.
 *
 *              SHARED BY THE RESET PAGE AND THE SETTINGS PAGE because they ask
 *              for exactly the same thing and only differ in what they do with
 *              it. Two copies would drift the first time either grew a rule.
 *
 *              THE MATCH IS SHOWN AS YOU TYPE, but it is not what enforces the
 *              rule — the schema on the server does that. This is the fast
 *              feedback that stops someone submitting a typo they cannot see,
 *              since both fields are masked.
 * Version:     0.23.0
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Initial implementation (Phase 9A)
 */

'use client';

import { useState } from 'react';
import { Check, Eye, EyeOff } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MIN_PASSWORD_LENGTH } from '@/features/auth/schema';

export interface NewPasswordFieldsProps {
  /** Which field the server complained about, if any. */
  errorField?: string;
  /** Wording for the first label; the flows call it different things. */
  label?: string;
  /*
   * CONTROLLED BY THE PARENT, not by this component. Settings needs to empty
   * both fields once the change has gone through, and owning the values here
   * would leave it reaching for an effect to do it — which is both a lint error
   * and the wrong shape. The parent already knows when the action succeeded.
   */
  password: string;
  confirmPassword: string;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
}

/**
 * Renders the new-password pair.
 *
 * @param errorField              - The field the server reported an error against.
 * @param label                   - Label for the first field.
 * @param password                - The first field's value.
 * @param confirmPassword         - The second field's value.
 * @param onPasswordChange        - Called as the first field is typed in.
 * @param onConfirmPasswordChange - Called as the second field is typed in.
 * @returns The two field groups.
 */
export function NewPasswordFields({
  errorField,
  label = 'New password',
  password,
  confirmPassword,
  onPasswordChange,
  onConfirmPasswordChange,
}: NewPasswordFieldsProps) {
  const [showPassword, setShowPassword] = useState(false);

  const longEnough = password.length >= MIN_PASSWORD_LENGTH;
  const bothTyped = password.length > 0 && confirmPassword.length > 0;
  const matches = bothTyped && password === confirmPassword;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{label}</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            aria-invalid={errorField === 'password' || undefined}
            aria-describedby="password-hint"
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="text-outline hover:text-on-surface focus-visible:ring-brand/35 absolute top-1/2 right-3 -translate-y-1/2 rounded-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <Eye className="size-4" aria-hidden="true" />
            ) : (
              <EyeOff className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <p
          id="password-hint"
          className={
            longEnough
              ? 'text-brand flex items-center gap-1.5 text-label-sm font-normal'
              : 'text-outline text-label-sm font-normal'
          }
        >
          {longEnough ? <Check className="size-3.5" aria-hidden="true" /> : null}
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Re-enter new password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          /* Never unmasked by the toggle: the point of this field is to catch a
             typo in the first one, and revealing both defeats it. */
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => onConfirmPasswordChange(event.target.value)}
          aria-invalid={errorField === 'confirmPassword' || undefined}
          aria-describedby="confirm-hint"
        />
        <p
          id="confirm-hint"
          className={
            bothTyped && !matches
              ? 'text-destructive text-label-sm font-normal'
              : 'text-brand flex items-center gap-1.5 text-label-sm font-normal'
          }
        >
          {bothTyped ? (
            matches ? (
              <>
                <Check className="size-3.5" aria-hidden="true" />
                Both passwords match.
              </>
            ) : (
              'Those two passwords are not the same yet.'
            )
          ) : null}
        </p>
      </div>
    </>
  );
}
