/**
 * File:        src/components/profile/delete-account-section.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Deleting your account, and the dialog that makes sure you meant
 *              it.
 *
 *              THE COPY LISTS WHAT GOES, because "this cannot be undone" is a
 *              warning about severity and not about content — a student is
 *              entitled to know that their groups, their messages and the wall
 *              posts they wrote go with them before they decide.
 *
 *              TYPING DELETE RATHER THAN A SECOND BUTTON. The action is one
 *              press away from the rest of a settings page full of harmless
 *              saves, and a confirm dialog answered by muscle memory is not a
 *              confirmation. The server checks the word too.
 *
 *              A native <dialog>, matching rate-partner-dialog: focus trapping,
 *              Escape and the backdrop come from the platform.
 * Version:     0.23.0
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Initial implementation (Phase 9A)
 */

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteAccount } from '@/features/auth/actions';

/** What has to be typed before the button will work. */
const CONFIRM_WORD = 'DELETE';

/**
 * Renders the delete-account section and its confirmation dialog.
 *
 * @returns The section element.
 */
export function DeleteAccountSection() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [state, formAction, pending] = useActionState(deleteAccount, null);

  const error = state && !state.ok ? state.error : null;

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <section aria-labelledby="delete-heading" className="clay-card border-destructive/30 p-6">
      <h2 id="delete-heading" className="font-heading text-destructive text-headline-md">
        Delete account
      </h2>
      <p className="text-on-surface-variant mt-1 mb-4 text-body-md text-pretty">
        Permanently removes your profile, your availability, your ratings, the groups you
        own, your messages and everything you have written on any wall. This cannot be
        undone, and the address becomes free to register again.
      </p>

      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setConfirmation('');
          setOpen(true);
        }}
        className="text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        Delete my account
      </Button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="delete-dialog-heading"
        className="bg-surface text-on-surface w-[min(28rem,calc(100vw-2rem))] rounded-xl p-0 backdrop:bg-black/40"
      >
        <form action={formAction} className="flex flex-col gap-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <h3 id="delete-dialog-heading" className="font-heading text-headline-md">
              Delete your account?
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-outline hover:text-on-surface focus-visible:ring-brand/35 rounded-sm transition-colors focus-visible:ring-4 focus-visible:outline-none"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          <p className="text-on-surface-variant text-body-md text-pretty">
            Everything on your profile goes with it, and your classmates lose the study
            connections you gave them. There is no way back from this.
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmation">
              Type {CONFIRM_WORD} to confirm
            </Label>
            <Input
              id="confirmation"
              name="confirmation"
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              aria-invalid={error?.field === 'confirmation' || undefined}
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

          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Keep my account
            </Button>
            <Button
              type="submit"
              disabled={pending || confirmation !== CONFIRM_WORD}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Delete for good
            </Button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
