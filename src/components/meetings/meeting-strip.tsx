/**
 * File:        src/components/meetings/meeting-strip.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The sessions booked from a chat, above its messages.
 *
 *              WHY THIS IS NOT A MESSAGE. A meeting changes after it is posted —
 *              people drop out, the organiser calls it off, it finishes and
 *              becomes rateable — and a message is a record of what someone said
 *              at a moment. Rendering from the `meetings` table instead means the
 *              card is always current, and neither message table needed a column.
 *
 *              A CANCELLED RSVP KEEPS THE CARD. It goes quiet rather than
 *              disappearing, because a student who pulled out still needs to see
 *              what they pulled out of and to be able to change their mind while
 *              it is still ahead of them.
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7)
 */

'use client';

import { useState, useTransition, useEffect } from 'react';
import { AlertCircle, CalendarClock, Loader2, MapPin, Users, X } from 'lucide-react';

import { cancelMeeting, setMeetingRsvp } from '@/features/meetings/actions';
import { formatMeetingWhen, type MeetingView } from '@/features/meetings/meeting-view';
import { cn } from '@/lib/utils';

export interface MeetingStripProps {
  meetings: MeetingView[];
}

/**
 * Renders the booked sessions for one chat.
 *
 * @param meetings - Sessions from the last day and everything ahead.
 * @returns The strip, or null when there is nothing booked.
 */
export function MeetingStrip({ meetings }: MeetingStripProps) {
  if (meetings.length === 0) {
    return null;
  }

  return (
    <ul aria-label="Scheduled sessions" className="flex flex-col gap-2 px-4 pt-3">
      {meetings.map((meeting) => (
        <MeetingCard key={meeting.id} meeting={meeting} />
      ))}
    </ul>
  );
}

/**
 * One session, with whatever the viewer can still do about it.
 *
 * @param meeting - The session.
 * @returns The list item.
 */
function MeetingCard({ meeting }: { meeting: MeetingView }) {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`dismissed-meeting-${meeting.id}`) !== 'true';
    }
    return true;
  });

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(`dismissed-meeting-${meeting.id}`, 'true');
  };

  const act = (run: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    setError(null);

    startTransition(async () => {
      const result = await run();

      if (!result.ok && result.error) {
        setError(result.error.message);
      }
    });
  };

  if (!isMounted || !isVisible) return null;

  return (
    <li
      className={cn(
        'relative rounded-md border px-3 py-2.5 transition-colors', 
        meeting.going
          ? 'border-brand/40 bg-brand-fixed/40'
          : 'border-outline-variant/50 bg-surface-container-high/40',
      )}
    >
      {meeting.hasFinished ? (
        <button
          onClick={handleDismiss}
          className="absolute right-2 top-2 text-outline hover:text-on-surface-variant transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 rounded-sm"
          aria-label="Dismiss meeting"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 pr-6"> 
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-label-md">
            <CalendarClock className="text-brand size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{meeting.title}</span>
          </p>

          <p className="text-on-surface-variant mt-1 text-label-sm font-normal">
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