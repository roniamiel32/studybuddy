/**
 * File:        src/components/profiles/rate-partner-dialog.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "How did studying together go?" — the two ratings, and the copy that
 *              makes their consequences honest.
 *
 *              THE COPY IS THE FEATURE HERE. The two choices do very different
 *              things and a student is entitled to know which before pressing:
 *              positive appears on the other person's profile with your name on it,
 *              negative is never shown to anyone and simply stops the pairing. Both
 *              are stated in the dialog, because a rating whose effect is a surprise
 *              is a rating people give carelessly.
 *
 *              A native <dialog>, so focus trapping, Escape and the backdrop come
 *              from the platform.
 * Version:     0.18.0
 *
 * Modifications:
 *     0.18.0 - 2026-08-10 - Initial implementation (Phase 6)
 */

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, EyeOff, Loader2, Star, ThumbsDown, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { rateStudyPartner, withdrawRating } from '@/features/profiles/actions';
import { cn } from '@/lib/utils';

export interface RatePartnerDialogProps {
  rateeId: string;
  rateeName: string;
  /** The viewer's existing rating, so the dialog opens on what they already said. */
  myRating: 'positive' | 'negative' | null;
  /** Recorded on the rating when it came from a course context. */
  courseOfferingId?: string | null;
}

/**
 * Renders the rating control and its dialog.
 *
 * @param rateeId          - The student being rated.
 * @param rateeName        - Their name, used throughout the copy.
 * @param myRating         - The viewer's existing rating, if any.
 * @param courseOfferingId - The course they studied for, if known.
 * @returns The button and dialog elements.
 */
export function RatePartnerDialog({
  rateeId,
  rateeName,
  myRating,
  courseOfferingId,
}: RatePartnerDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<'positive' | 'negative'>(myRating ?? 'positive');
  const [note, setNote] = useState('');

  const [saveState, saveAction, saving] = useActionState(rateStudyPartner, null);
  const [clearState, clearAction, clearing] = useActionState(withdrawRating, null);

  const error =
    saveState && !saveState.ok
      ? saveState.error
      : clearState && !clearState.ok
        ? clearState.error
        : null;

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

  /* Close once either action lands; the page revalidates behind it. */
  const succeeded = saveState?.ok === true || clearState?.ok === true;
  const latest = saveState?.ok ? saveState : clearState?.ok ? clearState : null;
  const [handled, setHandled] = useState<unknown>(null);

  if (succeeded && latest !== handled) {
    setHandled(latest);
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant={myRating === 'positive' ? 'outline' : 'secondary'}
        onClick={() => {
          setChoice(myRating ?? 'positive');
          setOpen(true);
        }}
      >
        {myRating === 'positive' ? (
          <>
            <Check aria-hidden="true" />
            You studied together
          </>
        ) : myRating === 'negative' ? (
          /* Shown only to the rater. Worded neutrally — "your note" rather than
             "you rated them badly" — because they may be looking at this in front
             of someone. */
          <>
            <EyeOff aria-hidden="true" />
            Your private note
          </>
        ) : (
          <>
            <Star aria-hidden="true" />
            Rate your session
          </>
        )}
      </Button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="rate-title"
        className="bg-surface shadow-clay-lifted m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl p-0 backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <div className="border-outline-variant/30 flex items-start justify-between gap-4 border-b p-5">
          <div>
            <h2 id="rate-title" className="font-heading text-headline-md">
              How did it go with {rateeName}?
            </h2>
            <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
              This shapes who we suggest to you both.
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

        <form action={saveAction} className="flex flex-col gap-4 p-5">
          <input type="hidden" name="rateeId" value={rateeId} />
          <input type="hidden" name="sentiment" value={choice} />
          {courseOfferingId ? (
            <input type="hidden" name="courseOfferingId" value={courseOfferingId} />
          ) : null}

          {error ? (
            <p role="alert" className="text-destructive flex items-start gap-2 text-label-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error.message}
            </p>
          ) : null}

          {/*
            * Two cards rather than a five-star scale. A number invites comparison
            * between people; this question is only ever "would we pair you again",
            * and two answers is the honest resolution of it.
            */}
          <fieldset className="flex flex-col gap-3">
            <legend className="sr-only">How the session went</legend>

            <label
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                choice === 'positive'
                  ? 'border-brand bg-brand-fixed/40'
                  : 'border-outline-variant/60 hover:border-brand/40',
              )}
            >
              <input
                type="radio"
                name="choice"
                value="positive"
                checked={choice === 'positive'}
                onChange={() => setChoice('positive')}
                className="accent-brand mt-0.5 size-4"
              />
              <span>
                <span className="block text-label-md">It went well</span>
                <span className="text-on-surface-variant block text-label-sm font-normal">
                  Shown on {rateeName}&apos;s profile with your name, and we will
                  suggest each other to you more often.
                </span>
              </span>
            </label>

            <label
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors',
                choice === 'negative'
                  ? 'border-outline bg-surface-container'
                  : 'border-outline-variant/60 hover:border-outline/60',
              )}
            >
              <input
                type="radio"
                name="choice"
                value="negative"
                checked={choice === 'negative'}
                onChange={() => setChoice('negative')}
                className="accent-brand mt-0.5 size-4"
              />
              <span>
                <span className="block text-label-md">It did not work out</span>
                <span className="text-on-surface-variant block text-label-sm font-normal">
                  {/*
                    * Stated as plainly as it can be. This is the promise the SELECT
                    * policy enforces, and the student choosing it deserves to know
                    * exactly how far it travels: nowhere.
                    */}
                  Completely private. {rateeName} is never told, nothing appears on
                  either profile, and we stop suggesting you to each other.
                </span>
              </span>
            </label>
          </fieldset>

          {choice === 'negative' ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="rating-note" className="text-label-md">
                Anything we should know? (optional, private)
              </label>
              <textarea
                id="rating-note"
                name="note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="They did not show up twice."
                className="border-outline-variant/60 bg-field focus-visible:border-brand focus-visible:ring-brand/25 w-full resize-none rounded-md border px-4 py-2 text-body-md transition-colors outline-none focus-visible:bg-white focus-visible:ring-4"
              />
              <p className="text-outline text-label-sm font-normal">
                Only you can ever read this.
              </p>
            </div>
          ) : null}

          <div className="border-outline-variant/30 flex flex-wrap items-center gap-3 border-t pt-4">
            <Button type="submit" disabled={saving || clearing}>
              {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {myRating ? 'Update' : 'Save'}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={saving || clearing}
            >
              Cancel
            </Button>
          </div>
        </form>

        {myRating ? (
          /* Separate form: a different action, and nesting it would submit the
             rating instead of withdrawing it. */
          <form action={clearAction} className="border-outline-variant/30 border-t p-5">
            <input type="hidden" name="rateeId" value={rateeId} />
            <button
              type="submit"
              disabled={saving || clearing}
              className="text-on-surface-variant hover:text-destructive focus-visible:ring-destructive/35 flex items-center gap-2 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
            >
              {clearing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ThumbsDown className="size-4" aria-hidden="true" />
              )}
              Withdraw my rating
            </button>
          </form>
        ) : null}
      </dialog>
    </>
  );
}
