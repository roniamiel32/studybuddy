/**
 * File:        src/components/meetings/meeting-strip.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The sessions booked from a chat, above its messages.
 *
 *              DISMISSAL IS A ROW IN THE DATABASE, NOT A KEY IN localStorage.
 *              The old version wrote `dismissed-meeting-<id>` to the browser,
 *              which made the banner come back on the student's phone after they
 *              cleared it on their laptop, and again on either one after a cache
 *              clear — and it cost a mount-gate that blanked the whole strip on
 *              the first paint of every chat, because the render could not know
 *              what localStorage held until the effect had run. A row per
 *              (person, meeting) is per account, survives devices, and arrives
 *              with the server render.
 *
 *              THE X IS ONLY DRAWN ONCE THE SESSION IS OVER. Before then the
 *              banner is the reminder that they agreed to go, and a student who
 *              does not want to go has a different control for that — the RSVP
 *              beside it, which the other attendees can see. Hiding a session you
 *              have not been to is how somebody quietly stops turning up. The
 *              INSERT policy on dismissed_meetings enforces the same rule, so
 *              this is presentation rather than the guard.
 * Version:     0.29.0
 *
 * Modifications:
 *     0.29.0 - 2026-08-14 - Per-account, time-restricted dismissal (Phase 9G)
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7)
 */

'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, CalendarClock, Loader2, MapPin, Users, X } from 'lucide-react';

import { cancelMeeting, dismissMeeting, setMeetingRsvp } from '@/features/meetings/actions';
import {
  formatMeetingWhen,
  isBannerMeeting,
  type MeetingView,
} from '@/features/meetings/meeting-view';
import { cn } from '@/lib/utils';

export interface MeetingStripProps {
  meetings: MeetingView[];
}

/**
 * Renders the booked sessions for one chat.
 *
 * Narrowed to the banner's own window — everything still ahead, plus a day after
 * each one ends. The full list goes to the feed, where the cards are history and
 * do not expire.
 */
export function MeetingStrip({ meetings }: MeetingStripProps) {
  const showing = meetings.filter((meeting) => isBannerMeeting(meeting));

  if (showing.length === 0) {
    return null;
  }

  return (
    <ul aria-label="Scheduled sessions" className="flex flex-col gap-2 px-4 pt-3">
      {showing.map((meeting) => (
        <MeetingCard key={meeting.id} meeting={meeting} />
      ))}
    </ul>
  );
}

/**
 * One session, with whatever the viewer can still do about it.
 */
function MeetingCard({ meeting }: { meeting: MeetingView }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /*
   * Optimistic, and one-way. The action revalidates, which drops this meeting
   * from the server's list and unmounts the card — but that is a round trip, and
   * the banner should go the moment it is clicked. If the write fails the card
   * comes back with the reason on it.
   */
  const [dismissed, setDismissed] = useState(false);

  const act = (run: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    setError(null);

    startTransition(async () => {
      const result = await run();

      if (!result.ok && result.error) {
        setError(result.error.message);
      }
    });
  };

  const handleDismiss = () => {
    setDismissed(true);
    setError(null);

    startTransition(async () => {
      const result = await dismissMeeting({ meetingId: meeting.id });

      if (!result.ok) {
        setDismissed(false);
        setError(result.error.message);
      }
    });
  };

  if (dismissed) {
    return null;
  }

  return (
    <li
      className={cn(
        'relative rounded-md border px-3 py-2.5 transition-colors', 
        meeting.going
          ? 'border-brand/40 bg-brand-fixed/40'
          : 'border-outline-variant/50 bg-surface-container-high/40',
      )}
    >
      {/* Only once it is over, and only ever for this student. hasFinished is
          computed on the server, so this does not appear mid-session without a
          refresh — which is the same beat on which the RSVP controls disappear. */}
      {meeting.hasFinished ? (
        <button
          type="button"
          disabled={pending}
          onClick={handleDismiss}
          className="absolute right-2 top-2 text-outline hover:text-on-surface-variant transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 rounded-sm disabled:opacity-60"
          aria-label={`Clear ${meeting.title} from your chat`}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}

      <div
        className={cn(
          'flex flex-wrap items-start justify-between gap-x-4 gap-y-2',
          meeting.hasFinished && 'pr-6',
        )}
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-label-md">
            <CalendarClock className="text-brand size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{meeting.title}</span>
          </p>

          {/* Formatted in the reader's zone, not the server's. The old mount
              gate hid this — the strip never rendered on the server at all — and
              removing it brings the mismatch into view for anybody abroad. */}
          <p
            suppressHydrationWarning
            className="text-on-surface-variant mt-1 text-label-sm font-normal"
          >
            {formatMeetingWhen(meeting.startsAt, meeting.endsAt)}
            {meeting.hasFinished ? ' — finished' : null}
          </p>

          <p className="text-outline mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-label-sm font-normal">
            <span className="flex items-center gap-1">
              <Users className="size-3.5" aria-hidden="true" />
              {meeting.otherAttendees === 0
                ? 'Nobody else is coming yet'
                : `${meeting.otherAttendees} other${meeting.otherAttendees === 1 ? '' : 's'} coming`}
            </span>

            {meeting.location ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                {meeting.location}
              </span>
            ) : null}
          </p>

          {!meeting.going ? (
            <p className="text-outline mt-1 text-label-sm font-normal">
              You are not going to this one.
            </p>
          ) : null}
        </div>

        {meeting.hasFinished ? null : (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                act(() => setMeetingRsvp({ meetingId: meeting.id, going: !meeting.going }))
              }
              className="text-on-surface-variant hover:text-brand focus-visible:ring-brand/35 flex items-center gap-1.5 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              {meeting.going ? 'Cannot make it' : 'I can make it'}
            </button>

            {meeting.isOrganiser ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => act(() => cancelMeeting({ meetingId: meeting.id }))}
                className="text-outline hover:text-destructive focus-visible:ring-brand/35 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
              >
                Call it off
              </button>
            ) : null}
          </div>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-destructive mt-2 flex items-start gap-2 text-label-sm">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </li>
  );
}