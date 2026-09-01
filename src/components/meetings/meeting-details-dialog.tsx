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
 *
 *              THE "ADD TO GOOGLE CALENDAR" LINK IS THE WHOLE CALENDAR STORY NOW.
 *              It is a plain template URL, so it needs no OAuth scope and no
 *              verified Google app — but it also means the app cannot reach back
 *              into the calendar it opened. Stepping out of a session therefore
 *              has to ASK the student to remove their own copy, which is what
 *              the toast on "Not attending" is for.
 * Version:     0.53.0
 *
 * Modifications:
 *     0.53.0 - 2026-09-01 - A repeating session says so, carries the rule for
 *                           Google in its link, and offers the organiser the two
 *                           ways of ending it
 *     0.49.0 - 2026-09-01 - "Not attending" raises a toast asking the student to
 *                           remove the session from their personal calendar
 *     0.29.0 - 2026-08-14 - Initial implementation (Phase 9G)
 */

'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Check,
  Loader2,
  MapPin,
  Repeat,
  Users,
  X,
} from 'lucide-react';

import { useToast } from '@/components/ui/toast';
import {
  cancelMeeting,
  cancelMeetingSeries,
  setMeetingRsvp,
} from '@/features/meetings/actions';
import { formatMeetingWhen, type MeetingView } from '@/features/meetings/meeting-view';
import { useHasFinished } from '@/lib/use-has-finished';
import { cn } from '@/lib/utils';

import { Calendar } from 'lucide-react';

const formatGoogleCalendarDate = (startsAt: string | Date, endsAt: string | Date) => {
  const format = (d: string | Date) => new Date(d).toISOString().replace(/-|:|\.\d+/g, '');
  return `${format(startsAt)}/${format(endsAt)}`;
};

/*
 * THE RULE GOES OVER THE LINK, WHICH IS THE WHOLE POINT OF THE MANUAL ROUTE.
 * We cannot write to anybody's calendar, but the template URL takes an RRULE and
 * Google expands it on their side — so one press still gives the student every
 * Tuesday rather than one Tuesday and a note to do the other seven by hand.
 *
 * No UNTIL and no COUNT, matching what the series actually is: it repeats until
 * somebody stops it. Stopping it here frees the slots in StudyBuddy; the copy
 * that Google is now holding is the student's own, and the toast on "Not
 * attending" is what asks them to tidy it.
 */
const WEEKLY_RRULE = 'RRULE:FREQ=WEEKLY';

/*
 * Said after a successful "Not attending". The session is off for this student
 * either way — this is only about the copy they may have added themselves with
 * the link above, which nothing on this side can delete for them.
 */
const CANCELLED_MESSAGE =
  'Session cancelled. If you added this to your personal calendar, please remember to remove it there as well.';

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
  const notify = useToast();

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
       * The toast, not the dialog, is what confirms a cancellation. The dialog
       * closes on success (see below), so a line of text inside it would be gone
       * before anybody read it — and this particular sentence is a request to go
       * and do something in another app, which is worth surviving the close.
       */
      if (!going) {
        notify({ tone: 'info', message: CANCELLED_MESSAGE });
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

  /**
   * Ends a repeating session — this sitting, or the rest of the series.
   *
   * THE CHOICE LIVES HERE AS WELL AS ON THE BANNER, and it has to. The banner is
   * a strip of what is imminent; a series booked for the next eight Tuesdays is
   * reached through its card in the thread, and that card opens this. Offering
   * the choice only on the banner would mean a student could not stop a series
   * until its next sitting was nearly upon them.
   *
   * @param stop - The action to run, scoped to one sitting or to the series.
   * @returns Nothing.
   */
  const end = (stop: (input: { meetingId: string }) => Promise<
    { ok: true; data: unknown } | { ok: false; error: { message: string } }
  >) => {
    setError(null);

    startTransition(async () => {
      const result = await stop({ meetingId: meeting.id });

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

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

          {meeting.seriesId ? (
            <div className="flex items-start gap-3">
              <Repeat className="text-outline mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <dt className="sr-only">How often</dt>
                <dd className="text-label-md font-normal">
                  Repeats weekly
                  {/* Said here because the link below now books all of them, and
                      somebody pressing it should know what they are adding. */}
                </dd>
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
                  : `${meeting.otherAttendees} other${meeting.otherAttendees === 1 ? '' : 's'
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
            )}&details=${encodeURIComponent('Study session via StudyBuddy')}${
              meeting.seriesId ? `&recur=${encodeURIComponent(WEEKLY_RRULE)}` : ''
            }`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-brand hover:bg-brand/90 text-white rounded-xl text-label-sm font-medium transition shadow-sm"
          >
            <Calendar className="w-4 h-4 mr-1" />
            {meeting.seriesId ? 'Add weekly to Google Calendar' : 'Add to Google Calendar'}
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
              ? 'You attended this session.'
              : 'You didn\'t attend this session.'}
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

        {/*
          * TWO NAMED ENDINGS, AND ONLY FOR A SERIES. A one-off is called off from
          * the banner exactly as it always was; what needed saying out loud is
          * the difference between missing one Tuesday and ending all of them,
          * because the two are one word apart and only one of them is undoable
          * in a press.
          */}
        {meeting.seriesId && meeting.isOrganiser && !hasFinished ? (
          <div className="border-outline-variant/30 flex flex-col gap-2 border-t pt-4">
            <p className="text-label-md">Ending it</p>
            <p className="text-outline text-label-sm font-normal text-pretty">
              Calling off this one leaves the rest of them. Stopping the series frees
              every future session for everybody.
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => end(cancelMeeting)}
                className="border-outline-variant/60 hover:text-destructive focus-visible:ring-brand/35 rounded-md border bg-white px-4 py-2 text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                Call off this one
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={() => end(cancelMeetingSeries)}
                className="border-outline-variant/60 hover:text-destructive focus-visible:ring-brand/35 rounded-md border bg-white px-4 py-2 text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                Stop repeating
              </button>
            </div>
          </div>
        ) : null}
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
