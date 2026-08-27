/**
 * File:        src/components/meetings/meeting-details-dialog.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The whole of a booked session, opened from its card in the chat
 *              feed, with the two answers a student can give about it.
 *
 *              THE RSVP PAIR IS TWO BUTTONS, NOT A TOGGLE. The strip above the
 *              messages has a toggle — "Cannot make it" flipping to "I can make
 *              it" — because it is one line in a dense header and the label has
 *              to double as the state. A dialog has the room to show both
 *              answers at once with the current one marked, which is the shape
 *              that lets somebody confirm what they already said without having
 *              to work out whether the button names their state or the change to
 *              it. `aria-pressed` carries the same distinction to a screen reader.
 *
 *              IT IS A NATIVE <dialog>, matching the scheduler. showModal gives
 *              the focus trap, the inert background, the Escape key and the top
 *              layer for nothing, and every one of those is a thing a div would
 *              have to reimplement badly.
 * Version:     0.29.0
 *
 * Modifications:
 *     0.29.0 - 2026-08-14 - Initial implementation (Phase 9G)
 */

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { AlertCircle, CalendarClock, Check, Loader2, MapPin, Users, X } from 'lucide-react';

import { setMeetingRsvp } from '@/features/meetings/actions';
import { formatMeetingWhen, type MeetingView } from '@/features/meetings/meeting-view';
import { useHasFinished } from '@/lib/use-has-finished';
import { cn } from '@/lib/utils';

const formatGoogleCalendarDate = (startsAt: string | Date, endsAt: string | Date) => {
  const format = (d: string | Date) => new Date(d).toISOString().replace(/-|:|\.\d+/g, '');
  return `${format(startsAt)}/${format(endsAt)}`;
};

export interface MeetingDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  meeting: MeetingView;
}

/**
 * Renders one session in full, and takes the viewer's answer about it.
 *
 * @param open     - Whether the dialog is showing.
 * @param onClose  - Called when it should close, including on Escape.
 * @param meeting  - The session to describe.
 * @returns The dialog element.
 */
export function MeetingDetailsDialog({ open, onClose, meeting }: MeetingDetailsDialogProps) {
  /* See the note in meeting-strip: the server's answer is right once, and this
     keeps it right as the clock passes the session's end. */
  const hasFinished = useHasFinished(meeting.endsAt, meeting.hasFinished);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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

  /*
   * Clears a stale error from a previous open, during render rather than in an
   * effect — the same adjust-on-a-changed-value pattern the chat room uses to
   * clear its composer. An effect here would paint the old error for a frame on
   * reopen, and setState inside one is a cascading render the lint rule refuses.
   */
  const [openWas, setOpenWas] = useState(open);

  if (openWas !== open) {
    setOpenWas(open);
    setError(null);
  }

  const answer = (going: boolean) => {
    setError(null);

    startTransition(async () => {
      const result = await setMeetingRsvp({ meetingId: meeting.id, going });

      if (!result.ok) {
        /* Stays open on failure — a dialog that closes on a refusal takes the
           reason with it, and the student is left wondering what happened. */
        setError(result.error.message);
        return;
      }

      /*
       * CLOSES ON SUCCESS. It used to stay open so the marked answer moved under
       * the student's eyes, but answering is the only thing this dialog is for:
       * once it is done, the dialog is in the way of the chat behind it and
       * needs a second press to dismiss. The confirmation still lands — the
       * action revalidates, so the card and the banner underneath both show the
       * new answer as soon as it closes.
       */
      onClose();
    });
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="meeting-details-title"
      className="bg-surface shadow-clay-lifted m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl p-0 backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="border-outline-variant/30 flex items-start justify-between gap-4 border-b p-5">
        <div className="min-w-0">
          <p className="text-on-surface-variant text-label-sm">Study session</p>
          <h2
            id="meeting-details-title"
            className="font-heading text-headline-md mt-0.5 text-balance"
          >
            {meeting.title}
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-outline hover:bg-surface-container-high focus-visible:ring-brand/35 shrink-0 rounded-full p-2 transition-colors focus-visible:ring-4 focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <dl className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <CalendarClock className="text-brand mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <dt className="sr-only">When</dt>
              {/* The server and the browser can sit in different zones, and this
                  is formatted in the reader's. Without this the first paint is a
                  hydration mismatch on every session. */}
              <dd suppressHydrationWarning className="text-label-md">
                {formatMeetingWhen(meeting.startsAt, meeting.endsAt)}
              </dd>
              {hasFinished ? (
                <p className="text-outline mt-0.5 text-label-sm font-normal">
                  This session has finished.
                </p>
              ) : null}
            </div>
          </div>

          {meeting.location ? (
            <div className="flex items-start gap-3">
              <MapPin className="text-outline mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <dt className="sr-only">Where</dt>
                <dd className="text-label-md font-normal">{meeting.location}</dd>
              </div>
            </div>
          ) : null}

          <div className="flex items-start gap-3">
            <Users className="text-outline mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <dt className="sr-only">Who is coming</dt>
              <dd className="text-label-md font-normal">
                {meeting.otherAttendees === 0
                  ? 'Nobody else is coming yet'
                  : `${meeting.otherAttendees} other${
                      meeting.otherAttendees === 1 ? '' : 's'
                    } coming`}
              </dd>
            </div>
          </div>
        </dl>

        {/* <<< וכאן תוסיפי את כפתור ההוספה ליומן: >>> */}
        <div className="pt-2">
          <a
            href={`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
              meeting.title,
            )}&dates=${formatGoogleCalendarDate(
              meeting.startsAt,
              meeting.endsAt,
            )}&details=${encodeURIComponent('Study session via StudyBuddy')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-brand hover:bg-brand/90 text-white rounded-xl text-label-sm font-medium transition shadow-sm"
          >
             Add to Google Calendar 📅
          </a>
        </div>

        {error ? (
          <p role="alert" className="text-destructive flex items-start gap-2 text-label-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}

        {/*
          * Once a session starts, attendance is frozen by a database trigger —
          * the rule that stops somebody cancelling, skipping it, setting
          * themselves back to going and then rating people they never sat with.
          * Offering buttons that the database will refuse would be a worse
          * explanation than this sentence.
          */}
        {hasFinished ? (
          <p className="border-outline-variant/60 text-outline rounded-md border border-dashed p-3 text-label-sm font-normal text-pretty">
            {meeting.going
              ? 'You were down as going. Attendance is fixed once a session has started, so this can no longer change.'
              : 'You were not going to this one, and that can no longer change.'}
          </p>
        ) : (
          <fieldset className="border-outline-variant/30 flex flex-col gap-2 border-t pt-4">
            <legend className="text-label-md mb-1">Are you coming?</legend>

            <div className="flex flex-wrap gap-2">
              <RsvpButton
                label="Attending"
                selected={meeting.going}
                pending={pending}
                onClick={() => answer(true)}
              />
              <RsvpButton
                label="Not attending"
                selected={!meeting.going}
                pending={pending}
                onClick={() => answer(false)}
              />
            </div>
          </fieldset>
        )}
      </div>
    </dialog>
  );
}



/**
 * One of the two RSVP answers, marked when it is the current one.
 *
 * @param label    - The answer.
 * @param selected - Whether it is what the viewer has said.
 * @param pending  - Whether an answer is in flight.
 * @param onClick  - Gives this answer.
 * @returns The button element.
 */
function RsvpButton({
  label,
  selected,
  pending,
  onClick,
}: {
  label: string;
  selected: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      /* Not disabled when already selected: re-confirming is harmless, and a
         disabled control gives no way to ask "did that save?" after a failure. */
      disabled={pending}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-4 py-2 text-label-sm transition-colors',
        'focus-visible:ring-brand/35 focus-visible:ring-4 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-60',
        selected
          ? 'border-brand bg-brand text-white'
          : 'border-outline-variant/60 hover:bg-brand-fixed/60 bg-white',
      )}
    >
      {pending && selected ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : selected ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : null}
      {label}
    </button>
  );
}
