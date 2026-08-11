/**
 * File:        src/components/profile/availability-dialog.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Edit your free time" — the week editor, on the Profile tab.
 *
 *              A native <dialog>, the same one the course override
 *              questionnaire uses, so focus trapping, Escape and the backdrop
 *              come from the platform rather than from three effects and a
 *              keydown handler. Inside it is the same AvailabilityGrid as
 *              onboarding step 4 — the editor is the same editor, and only the
 *              way out of it differs.
 *
 *              Editing here used to mean a round trip through /onboarding, which
 *              ended by redirecting to the dashboard: the student asked to change
 *              one afternoon and was thrown off the page they were on.
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - Initial implementation
 */

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { AlertCircle, CalendarClock, Loader2, X } from 'lucide-react';

import { AvailabilityGrid } from '@/components/onboarding/availability-grid';
import { Button } from '@/components/ui/button';
import { updateAvailability } from '@/features/profile/actions';

export interface AvailabilityDialogProps {
  /** Manual slots already saved, encoded as `day|start|end`. */
  defaultSelected: string[];
}

/**
 * Renders the week editor control and its dialog.
 *
 * @param defaultSelected - The student's current week.
 * @returns The button and dialog elements.
 */
export function AvailabilityDialog({ defaultSelected }: AvailabilityDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [state, formAction, saving] = useActionState(updateAvailability, null);

  /*
   * Remounts the grid every time the dialog opens, which is what makes Cancel
   * mean cancel: the selection lives in the grid, so a fresh one starts from
   * what is actually saved rather than from abandoned edits.
   */
  const [session, setSession] = useState(0);

  const error = state && !state.ok ? state.error : null;

  /* showModal() is the only way to get the platform's focus trap and backdrop;
     it cannot be expressed as a prop, so the element is driven imperatively. */
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

  /* Close once the save succeeds — the page revalidates behind it. */
  const [handled, setHandled] = useState<unknown>(null);

  if (state?.ok === true && state !== handled) {
    setHandled(state);
    setOpen(false);
  }

  const openDialog = () => {
    setSession((current) => current + 1);
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="clay-btn-secondary focus-visible:ring-brand/35 flex items-center gap-2 rounded-md px-4 py-2 text-label-md focus-visible:ring-4 focus-visible:outline-none"
      >
        <CalendarClock className="size-4" aria-hidden="true" />
        Edit your free time
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="availability-dialog-title"
        /* Wider than the course questionnaire's 34rem, which is the one thing
           that could not be copied: the grid's own minimum is 34rem, so at that
           width Saturday sits off the edge behind a scrollbar no one looks for
           in a modal. Everything else here is the same shell. */
        className="bg-surface m-auto w-[min(42rem,calc(100vw-2rem))] rounded-xl p-0 shadow-clay-lifted backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <div className="border-outline-variant/30 flex items-start justify-between gap-4 border-b p-5">
          <div>
            <h2 id="availability-dialog-title" className="font-heading text-headline-md">
              When are you free?
            </h2>
            <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
              Tap the blocks you could study in. This is the week everyone is matched against.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-outline hover:bg-surface-container-high focus-visible:ring-brand/35 shrink-0 rounded-full p-2 transition-colors focus-visible:ring-4 focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <form action={formAction} className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto p-5">
          {error ? (
            <p role="alert" className="text-destructive flex items-start gap-2 text-label-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error.message}
            </p>
          ) : null}

          <AvailabilityGrid
            key={session}
            defaultSelected={defaultSelected}
            emptyHint="An empty week means we cannot rank anyone by overlap."
          />

          <div className="border-outline-variant/30 flex flex-wrap items-center gap-3 border-t pt-4">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Save
            </Button>

            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
