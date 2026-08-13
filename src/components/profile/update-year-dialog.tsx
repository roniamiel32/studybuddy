/**
 * File:        src/components/profile/update-year-dialog.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "A new academic year is starting!" — asked once each autumn.
 *
 *              THE THIRD BUTTON IS THE HONEST ONE. A two-button version forces
 *              an answer out of someone who does not yet know theirs — results
 *              are not out, a repeat is undecided — and whichever they press to
 *              make the box go away is then wrong in public until next August.
 *              "Ask me later" costs a week and keeps the data true.
 *
 *              IT OPENS AS A MODAL AND CANNOT BE ESCAPED INTO NOTHING. There is
 *              no close button and Escape is cancelled, because dismissing this
 *              without recording anything means being asked again on the very
 *              next page load — which is worse for the student than any of the
 *              three answers. "Ask me later" is the way out, and it is a button.
 *
 *              A native <dialog>, matching rate-partner-dialog: focus trapping
 *              and the backdrop come from the platform.
 * Version:     0.24.0
 *
 * Modifications:
 *     0.24.0 - 2026-08-13 - Initial implementation (Phase 9B)
 */

'use client';

import { useActionState, useEffect, useRef } from 'react';
import { AlertCircle, CalendarClock, Check, Clock, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { answerAcademicYearPrompt } from '@/features/profile/actions';

export interface UpdateYearDialogProps {
  /** What the profile says today, so the dialog can name both years. */
  yearOfStudy: number;
}

/**
 * Renders the new-academic-year prompt.
 *
 * @param yearOfStudy - The student's current year.
 * @returns The dialog element.
 */
export function UpdateYearDialog({ yearOfStudy }: UpdateYearDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(answerAcademicYearPrompt, null);

  const error = state && !state.ok ? state.error : null;

  useEffect(() => {
    const dialog = dialogRef.current;

    /*
     * Opened from an effect rather than rendered open: showModal() is what puts
     * it in the top layer and gives it the backdrop and the focus trap, and it
     * is a DOM call with no declarative equivalent.
     */
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="year-dialog-heading"
      /* Escape would close it without recording an answer, and it would be back
         on the next navigation. The three buttons are the only ways out. */
      onCancel={(event) => event.preventDefault()}
      /* m-auto is what centres it: Tailwind's preflight clears the margin:auto
         a modal <dialog> centres itself with, so without this it sits in the
         top-left corner with its buttons off the edge. Same as
         rate-partner-dialog. */
      className="bg-surface text-on-surface shadow-clay-lifted m-auto w-[min(36rem,calc(100vw-2rem))] rounded-xl p-0 backdrop:bg-black/40"
    >
      <form action={formAction} className="flex flex-col gap-5 p-6">
        <span className="bg-brand-fixed/60 text-brand flex size-12 items-center justify-center rounded-full">
          <CalendarClock className="size-6" aria-hidden="true" />
        </span>

        <div>
          <h2 id="year-dialog-heading" className="font-heading text-headline-md text-balance">
            A new academic year is starting! Are you advancing to the next year?
          </h2>
          <p className="text-on-surface-variant mt-2 text-body-md text-pretty">
            Your profile says you are in year {yearOfStudy}. Saying yes moves you to year{' '}
            {yearOfStudy + 1}, which is what your classmates see and what your matches are
            worked out from.
          </p>
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

        {/*
          One form, three submit buttons carrying different values for the same
          name. The server reads `choice`; the browser sends whichever button was
          pressed, so there is no state to keep in sync and nothing to get wrong
          if two are pressed quickly.
        */}
        <div className="mt-4 flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="submit"
            name="choice"
            value="later"
            variant="ghost"
            disabled={pending}
            className="w-full sm:w-auto"
          >
            <Clock className="size-4" aria-hidden="true" />
            Ask me later
          </Button>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button
              type="submit"
              name="choice"
              value="no"
              variant="secondary"
              disabled={pending}
              className="w-full sm:w-auto"
            >
              <X className="size-4" aria-hidden="true" />
              No, same year
            </Button>

            <Button
              type="submit"
              name="choice"
              value="yes"
              disabled={pending}
              className="w-full sm:w-auto"
            >
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Check className="size-4" aria-hidden="true" />
              )}
              Yes, I am in year {yearOfStudy + 1}
            </Button>
          </div>
        </div>
      </form>
    </dialog>
  );
}