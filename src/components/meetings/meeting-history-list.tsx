/**
 * File:        src/components/meetings/meeting-history-list.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Meeting History" — every session a student has scheduled through
 *              StudyBuddy, on their own profile and nobody else's.
 *
 *              TWO LISTS, NOT ONE. Upcoming reads forwards because the next
 *              session is what you opened this to check; past reads backwards
 *              because that is how anyone reads a history. The split itself is
 *              done in the view model, off a `hasFinished` the server decided —
 *              see splitMeetingHistory.
 *
 *              A CLIENT COMPONENT FOR ONE REASON: the times. Everything else on
 *              this screen would render happily on the server, but a stamp is
 *              formatted in the READER'S zone, and the server does not share it.
 *              suppressHydrationWarning on the stamps is the same treatment the
 *              chat cards and the scheduler give theirs.
 *
 *              EVERY ROW IS A LINK INTO ITS CHAT, upcoming or past, still going
 *              or stepped out of. The chat is where a session's details, its
 *              other attendees and its RSVP control all live, so the history
 *              needs none of those controls itself — it needs one way through to
 *              the place that has them.
 *
 *              THE SUMMARY ROW IS THE FIRST READER of summariseMeetingHistory,
 *              which is where the statistics screen will get its numbers when it
 *              is built. Kept in the view model rather than counted inline here
 *              so the definition of "attended" is written down once.
 * Version:     0.48.0
 *
 * Modifications:
 *     0.48.0 - 2026-08-19 - Every row links into its chat; the cancelled chip is
 *                           gone, because cancelled sessions no longer arrive
 *     0.47.0 - 2026-08-19 - Initial implementation
 */

'use client';

import Link from 'next/link';
import { CalendarDays, ChevronRight, MapPin, UserRound } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { Chip } from '@/components/ui/chip';
import {
  formatMeetingPartners,
  formatMeetingWhen,
  meetingChatHref,
  splitMeetingHistory,
  summariseMeetingHistory,
  type MeetingHistoryEntry,
} from '@/features/meetings/meeting-view';

export interface MeetingHistoryListProps {
  /** The viewer's own sessions, soonest first, as the query returns them. */
  entries: MeetingHistoryEntry[];
}

/**
 * Renders the private meeting history.
 *
 * @param entries - The viewer's sessions.
 * @returns The section element.
 */
export function MeetingHistoryList({ entries }: MeetingHistoryListProps) {
  const { upcoming, past } = splitMeetingHistory(entries);
  const summary = summariseMeetingHistory(entries);

  return (
    <section aria-labelledby="meeting-history-heading" className="flex flex-col gap-6">
      <div className="clay-card p-5">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 id="meeting-history-heading" className="font-heading text-headline-md">
            Meeting History
          </h2>
          {summary.total > 0 ? <Chip tone="mint">{summary.total}</Chip> : null}
        </div>

        <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
          Every study session you have scheduled here, and who it was with. Only you
          can see this.
        </p>

        {summary.total > 0 ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Coming up" value={String(summary.upcoming)} />
            <Stat label="Sessions attended" value={String(summary.attended)} />
            <Stat label="Hours studied" value={`${summary.hoursStudied}`} />
            <Stat label="Study partners" value={String(summary.distinctPartners)} />
          </dl>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <div className="clay-card p-5">
          <p className="text-on-surface-variant bg-surface-container rounded-md p-4 text-body-md text-pretty">
            Nothing yet. Open a chat with a classmate, press the calendar icon, and the
            sessions you book will be listed here.
          </p>
        </div>
      ) : (
        <>
          <MeetingGroup
            id="upcoming-sessions"
            title="Upcoming"
            empty="Nothing booked ahead."
            entries={upcoming}
          />
          <MeetingGroup
            id="past-sessions"
            title="Past"
            empty="No sessions have happened yet."
            entries={past}
          />
        </>
      )}
    </section>
  );
}

/**
 * One number in the summary row.
 *
 * @param label - What is being counted.
 * @param value - The count, already formatted.
 * @returns The pair.
 */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-container rounded-md p-3">
      <dt className="text-outline text-label-sm font-normal">{label}</dt>
      <dd className="font-heading text-headline-md mt-0.5">{value}</dd>
    </div>
  );
}

/**
 * One half of the history — upcoming or past.
 *
 * @param id      - Heading id, so the list is labelled by it.
 * @param title   - The heading.
 * @param empty   - What to say when this half has nothing in it.
 * @param entries - The sessions, already in their reading order.
 * @returns The sub-section.
 */
function MeetingGroup({
  id,
  title,
  empty,
  entries,
}: {
  id: string;
  title: string;
  empty: string;
  entries: MeetingHistoryEntry[];
}) {
  return (
    <div aria-labelledby={id} className="clay-card p-5" role="group">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 id={id} className="font-heading text-headline-md">
          {title}
        </h3>
        {entries.length > 0 ? <Chip tone="neutral">{entries.length}</Chip> : null}
      </div>

      {entries.length === 0 ? (
        <p className="text-on-surface-variant bg-surface-container rounded-md p-4 text-body-md">
          {empty}
        </p>
      ) : (
        <ul aria-label={`${title} sessions`} className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li key={entry.id}>
              <MeetingHistoryRow entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One session: when it is, and who it is with, as a link into its chat.
 *
 * Those two facts lead, in that order, because they are the two the record is
 * for. The title comes third — it now names the partner as well, so leading with
 * it would say the same thing twice.
 *
 * A LINK RATHER THAN A BUTTON, so it opens in a new tab, copies, and is read out
 * as a destination. The chips inside it are spans, so there is exactly one
 * control per row and a keyboard reaches every session in one tab each.
 *
 * @param entry - The session.
 * @returns The row element.
 */
function MeetingHistoryRow({ entry }: { entry: MeetingHistoryEntry }) {
  const when = formatMeetingWhen(entry.startsAt, entry.endsAt);
  const partners = formatMeetingPartners(entry.partners);
  const href = meetingChatHref(entry);
  /* One face for a one-to-one; a group gets an icon rather than a pile of
     overlapping avatars in a row this size. */
  const single = entry.partners.length === 1 ? entry.partners[0] : null;

  const body = (
    <>
      {single ? (
        <MatchAvatar
          fullName={single.fullName}
          avatarUrl={single.avatarUrl}
          size={36}
          className="border-2"
        />
      ) : (
        <span
          aria-hidden="true"
          className="bg-surface-container flex size-9 shrink-0 items-center justify-center rounded-full"
        >
          <UserRound className="text-outline size-4" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        {/* Formatted in the reader's own zone, which the server does not share. */}
        <p suppressHydrationWarning className="text-label-md flex items-center gap-1.5">
          <CalendarDays className="text-brand size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{when}</span>
        </p>

        <p className="text-outline block truncate text-label-sm font-normal">
          with {partners}
          {entry.location ? (
            <>
              {' · '}
              <MapPin className="inline size-3 align-[-1px]" aria-hidden="true" />{' '}
              {entry.location}
            </>
          ) : null}
        </p>

        <p className="text-on-surface-variant mt-0.5 truncate text-label-sm font-normal">
          {entry.title}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="flex flex-col items-end gap-1">
          {entry.going ? null : <Chip tone="sand">You left</Chip>}
          {entry.scope === 'group' ? <Chip tone="sky">Group</Chip> : null}
        </div>

        {href ? (
          <ChevronRight className="text-outline size-4 shrink-0" aria-hidden="true" />
        ) : null}
      </div>
    </>
  );

  const shell = 'border-outline-variant/60 flex items-center gap-3 rounded-md border bg-white p-3';

  /*
   * A session whose chat has been deleted still belongs in the history — it
   * happened — but there is nowhere to send anybody, so it renders as the same
   * row without the link rather than as a control that goes nowhere.
   */
  if (!href) {
    return <div className={shell}>{body}</div>;
  }

  return (
    <Link
      href={href}
      aria-label={`${entry.title}, ${when}, with ${partners}. Open the chat.`}
      className={`${shell} hover:border-brand/60 focus-visible:ring-brand/35 transition-colors focus-visible:ring-4 focus-visible:outline-none`}
    >
      {body}
    </Link>
  );
}
