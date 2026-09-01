'use client';

import { useState, useTransition } from 'react';
import {
  AlertCircle,
  CalendarClock,
  Loader2,
  MapPin,
  Users,
  X,
  ChevronDown,
  ChevronUp,
  Repeat,
} from 'lucide-react';

import {
  cancelMeeting,
  cancelMeetingSeries,
  dismissMeeting,
  setMeetingRsvp,
} from '@/features/meetings/actions';
import { useHasFinished } from '@/lib/use-has-finished';
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
  const [isExpanded, setIsExpanded] = useState(false);

  const showing = meetings.filter((meeting) => isBannerMeeting(meeting));

  if (showing.length === 0) {
    return null;
  }

  // Sort meetings so the closest upcoming session is always at the top
  const sortedShowing = [...showing].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );

  const closestMeeting = sortedShowing[0];
  const otherMeetings = sortedShowing.slice(1);

  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {/* Always show the closest upcoming meeting */}
      <ul aria-label="Next upcoming session" className="flex flex-col gap-2">
        <MeetingCard
          key={closestMeeting.id}
          meeting={closestMeeting}
          expandOptions={
            otherMeetings.length > 0
              ? {
                  isExpanded,
                  toggle: () => setIsExpanded(!isExpanded),
                  count: otherMeetings.length,
                }
              : undefined
          }
        />
      </ul>

      {/* Scrollable list of the remaining meetings */}
      {isExpanded && otherMeetings.length > 0 && (
        <ul
          aria-label="Other scheduled sessions"
          className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1 mt-1"
        >
          {otherMeetings.map((meeting) => (
            <MeetingCard key={meeting.id} meeting={meeting} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One session, with whatever the viewer can still do about it.
 */
function MeetingCard({
  meeting,
  expandOptions,
}: {
  meeting: MeetingView;
  expandOptions?: { isExpanded: boolean; toggle: () => void; count: number };
}) {
  /*
   * NOT `meeting.hasFinished` DIRECTLY. That is the server's answer from the
   * render that produced this card, and it never changes again — a chat left
   * open while the session ends went on offering RSVP buttons for a session that
   * was over. This is the same value, plus a timer to the moment it changes.
   */
  const hasFinished = useHasFinished(meeting.endsAt, meeting.hasFinished);
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
          : 'border-outline-variant/50 bg-surface-container-high/40'
      )}
    >
      {/* Top right corner actions (Expand toggle and/or Dismiss button) */}
      <div className="absolute right-2 top-2 flex items-center gap-1">
        {expandOptions ? (
          <button
            type="button"
            onClick={expandOptions.toggle}
            className="text-outline hover:text-on-surface-variant flex items-center gap-0.5 rounded-sm p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35"
            aria-label={
              expandOptions.isExpanded
                ? 'Collapse sessions'
                : `Expand ${expandOptions.count} more sessions`
            }
          >
            {!expandOptions.isExpanded && (
              <span className="text-xs font-medium">+{expandOptions.count}</span>
            )}
            {expandOptions.isExpanded ? (
              <ChevronUp className="size-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4" aria-hidden="true" />
            )}
          </button>
        ) : null}

        {hasFinished ? (
          <button
            type="button"
            disabled={pending}
            onClick={handleDismiss}
            className="text-outline hover:text-on-surface-variant rounded-sm p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 disabled:opacity-60"
            aria-label={`Clear ${meeting.title} from your chat`}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          'flex flex-wrap items-start justify-between gap-x-4 gap-y-2',
          (hasFinished || expandOptions) && 'pr-12' // Make room for top right icons
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
            {hasFinished ? ' — finished' : null}
          </p>

          <p className="text-outline mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-label-sm font-normal">
            <span className="flex items-center gap-1">
              <Users className="size-3.5" aria-hidden="true" />
              {meeting.otherAttendees === 0
                ? 'Nobody else is coming yet'
                : `${meeting.otherAttendees} other${
                    meeting.otherAttendees === 1 ? '' : 's'
                  } coming`}
            </span>

            {meeting.location ? (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden="true" />
                {meeting.location}
              </span>
            ) : null}

            {/* Said on the card, not only in the dialog: the two cancel choices
                below make no sense to somebody who does not know this repeats. */}
            {meeting.seriesId ? (
              <span className="flex items-center gap-1">
                <Repeat className="size-3.5" aria-hidden="true" />
                Repeats weekly
              </span>
            ) : null}
          </p>

          {!meeting.going ? (
            <p className="text-outline mt-1 text-label-sm font-normal">
              You are not going to this one.
            </p>
          ) : null}
        </div>

        {hasFinished ? null : (
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

            {/*
              * TWO ANSWERS FOR A REPEATING SESSION, spelled out rather than
              * hidden behind a confirm. "Call it off" is one word away from
              * meaning either of them, and the two are not equally undoable:
              * this Tuesday can be rebooked in a press, eight weeks of Tuesdays
              * cannot. So each button names its own scope, and neither is the
              * default.
              */}
            {meeting.isOrganiser ? (
              meeting.seriesId ? (
                <>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => cancelMeeting({ meetingId: meeting.id }))}
                    className="text-outline hover:text-destructive focus-visible:ring-brand/35 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
                  >
                    Call off this one
                  </button>

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act(() => cancelMeetingSeries({ meetingId: meeting.id }))}
                    className="text-outline hover:text-destructive focus-visible:ring-brand/35 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
                  >
                    Stop repeating
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act(() => cancelMeeting({ meetingId: meeting.id }))}
                  className="text-outline hover:text-destructive focus-visible:ring-brand/35 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
                >
                  Call it off
                </button>
              )
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