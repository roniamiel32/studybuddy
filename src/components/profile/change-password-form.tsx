/**
 * File:        src/components/profile/change-password-form.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Changing your password from inside the app using a modal dialog.
 * Version:     0.26.0
 */

'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, Check, Eye, EyeOff, Loader2, Lock, X } from 'lucide-react';

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
  const [isOpen, setIsOpen] = useState(false);
  
  // Manage eye toggle states for each field individually
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Store new password values
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Function to reset all data and close the dialog
  const handleClose = () => {
    setIsOpen(false);
    setPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  const [state, formAction, pending] = useActionState(
    async (previous: Awaited<ReturnType<typeof changePassword>> | null, formData: FormData) => {
      const result = await changePassword(previous, formData);

      if (result.ok) {
        // Close and reset on success
        handleClose();
      }

      return result;
    },
    null,
  );

  const error = state && !state.ok ? state.error : null;

  return (
    <>
      {/* 1. Trigger Card - Styled like Your Week */}
      <section aria-labelledby="password-heading" className="clay-card flex flex-col items-start gap-4 p-6">
        <div>
          <h2 id="password-heading" className="font-heading text-headline-md">
            Change password
          </h2>
          <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
            Update your account password to keep it secure.
          </p>
        </div>
        <button
          onClick={() => setIsOpen(true)}
          className="clay-btn-secondary focus-visible:ring-brand/35 flex shrink-0 items-center gap-2 rounded-md px-4 py-2 text-label-md transition-colors focus-visible:ring-4 focus-visible:outline-none"
        >
          <Lock className="size-4" aria-hidden="true" />
          Update password
        </button>
      </section>

      {/* 2. Modal Dialog */}
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in sm:p-6 duration-200">
          <div 
            className="bg-white rounded-3xl shadow-xl w-full max-w-[500px] flex flex-col relative overflow-hidden animate-in zoom-in-95 duration-200"
            role="dialog"
            aria-modal="true"
          >
            {/* Close button X */}
            <button
              onClick={handleClose}
              className="text-outline hover:text-on-surface focus-visible:ring-brand/35 absolute top-5 right-5 rounded-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
              aria-label="Close dialog"
            >
              <X className="size-5" aria-hidden="true" />
            </button>

            {/* Title and description inside the modal */}
            <div className="p-6 pb-2">
              <h2 className="font-heading mb-2 text-[22px] leading-tight">
                Change your password
              </h2>
              <p className="text-on-surface-variant pr-6 text-body-md">
                You will stay signed in here. Anywhere else you are signed in stays signed in
                too — sign out from those devices if that is not what you want.
              </p>
            </div>

            {/* Change password form */}
            <form action={formAction} className="flex flex-col gap-5 p-6 pt-4" noValidate>
              
              {/* Current Password */}
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
                    {showCurrent ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">New password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showNew ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    aria-invalid={error?.field === 'password' || undefined}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="text-outline hover:text-on-surface focus-visible:ring-brand/35 absolute top-1/2 right-3 -translate-y-1/2 rounded-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    aria-label={showNew ? 'Hide password' : 'Show password'}
                  >
                    {showNew ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
                  </button>
                </div>
                <p className="text-on-surface-variant text-label-sm">At least 8 characters.</p>
              </div>

              {/* Confirm New Password */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmPassword">Re-enter new password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    aria-invalid={error?.field === 'confirmPassword' || undefined}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="text-outline hover:text-on-surface focus-visible:ring-brand/35 absolute top-1/2 right-3 -translate-y-1/2 rounded-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              {error ? (
                <p
                  id="form-error"
                  role="alert"
                  className="text-destructive bg-destructive/10 mt-1 flex items-start gap-2 rounded-md p-3 text-label-md"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {error.message}
                </p>
              ) : null}

              {/* Action buttons styled like the image (Save & Cancel) */}
              <div className="mt-2 flex items-center gap-4">
                <Button type="submit" disabled={pending} className="rounded-md px-6">
                  {pending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> : null}
                  Save
                </Button>
                
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-on-surface hover:text-on-surface-variant focus-visible:ring-brand/35 rounded-md px-2 text-label-md font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}