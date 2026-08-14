/**
 * File:        src/features/meetings/meeting-view.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: View models for scheduled study sessions, and the formatting the
 *              scheduler and the chat both need.
 *
 *              TIMES ARE RENDERED IN THE READER'S OWN ZONE, deliberately. The
 *              weekly availability grid is campus wall-clock — `time` with no
 *              zone, projected onto real dates in the university's timezone by
 *              rpc_meeting_slots — but what comes back is `timestamptz`, an
 *              actual instant. Formatting that instant locally is what makes
 *              "Sunday 14:00" read as 12:00 to a student in London, which is
 *              when they would have to be at their laptop.
 *
 *              No 'server-only' here: the dialog is a client component and needs
 *              these formatters.
 * Version:     0.29.0
 *
 * Modifications:
 *     0.29.0 - 2026-08-14 - createdAt, the banner window, and feed interleaving
 *                           for the inline session card (Phase 9G)
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7)
 */

/** A bookable two-hour window every participant of a chat is free for. */
export interface MeetingSlotView {
  /** ISO instant the window opens. */
  startsAt: string;
  /** ISO instant it closes. */
  endsAt: string;
  /** How many people it was computed across. */
  participantCount: number;
}

/** A scheduled session, as the chat and the schedule show it. */
export interface MeetingView {
  id: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  /** Whether the viewer is still going. False once they cancel. */
  going: boolean;
  /** Everyone else who is still coming. */
  otherAttendees: number;
  /** Whether the viewer booked it, and may therefore call it off entirely. */
  isOrganiser: boolean;
  /**
   * True once it has finished — the point at which rating opens, and the point
   * at which the banner may be dismissed.
   *
   * COMPUTED ON THE SERVER, and read here rather than recomputed from endsAt.
   * The chat is a client component, so a fresh `new Date()` during render gives
   * a different answer on the client than the one the HTML was built with, and
   * React logs a hydration mismatch for a session that finished between the two.
   * One server-rendered boolean, refreshed with everything else.
   */
  hasFinished: boolean;
  /**
   * When the session was booked, which is where its card sits in the chat feed.
   *
   * Not startsAt: the card is the announcement that somebody scheduled this, so
   * it belongs at the moment they did — beside the messages that led to it,
   * rather than jumping forward to a Tuesday nobody has reached yet.
   */
  createdAt: string;
  /**
   * Whether the VIEWER has cleared this session's banner. Never anybody else's.
   *
   * A FLAG RATHER THAN AN ABSENCE, because dismissing is about the banner alone.
   * Dropping the meeting from the query would take its card out of the feed too,
   * and the card is a record of something that happened in this chat — the same
   * kind of thing as the messages around it. You do not lose a week of history
   * by tidying a header.
   */
  bannerDismissed: boolean;
}

/** Slots for one calendar day, as the picker groups them. */
export interface MeetingSlotDay {
  /** The day these fall on, as an ISO date in the reader's zone. */
  date: string;
  /** Human label — "Sunday 17 August". */
  label: string;
  slots: MeetingSlotView[];
}

/**
 * Groups slots into the days they fall on.
 *
 * Grouped in the READER'S zone rather than by the UTC date, so a late-evening
 * slot never appears under tomorrow's heading.
 *
 * @param slots - Slots in ascending order, as the RPC returns them.
 * @returns One entry per day that has any slot, in the same order.
 */
export function groupSlotsByDay(slots: MeetingSlotView[]): MeetingSlotDay[] {
  const days = new Map<string, MeetingSlotDay>();

  for (const slot of slots) {
    const start = new Date(slot.startsAt);
    const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(
      start.getDate(),
    ).padStart(2, '0')}`;

    const existing = days.get(date);

    if (existing) {
      existing.slots.push(slot);
      continue;
    }

    days.set(date, {
      date,
      label: start.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
      slots: [slot],
    });
  }

  return [...days.values()];
}

/**
 * The time range of a slot, as "14:00 – 16:00".
 *
 * TWENTY-FOUR HOUR, unlike the message timestamps beside it, and that is the
 * point: these times came out of the weekly availability grid, where the student
 * chose them from rows labelled "12–14" and "18–20". Rendering the same hour back
 * as "2:00 PM" would make them translate between two clocks to check the picker
 * had understood.
 *
 * @param startsAt - ISO instant.
 * @param endsAt   - ISO instant.
 * @returns The formatted range.
 */
export function formatSlotRange(startsAt: string, endsAt: string): string {
  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });

  return `${time(startsAt)} – ${time(endsAt)}`;
}

/**
 * A meeting's day and time in one line — "Sun 17 Aug, 14:00 – 16:00".
 *
 * @param startsAt - ISO instant.
 * @param endsAt   - ISO instant.
 * @returns The formatted stamp.
 */
export function formatMeetingWhen(startsAt: string, endsAt: string): string {
  const day = new Date(startsAt).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return `${day}, ${formatSlotRange(startsAt, endsAt)}`;
}

/** How far back the banner keeps showing a session after it has ended. */
const BANNER_LOOKBACK_MS = 86_400_000;

/**
 * Whether a session still belongs in the strip above the messages.
 *
 * THE ONE PLACE THE BANNER NARROWS AND THE FEED DOES NOT. Both read the same
 * list; this decides what the strip keeps out of it, on two grounds:
 *
 *   - Age. The banner answers "what is happening in this chat", so it holds a
 *     session for a day after it ends — long enough to offer rating, which is
 *     when people most want to say something.
 *   - Dismissal. The student has said they are finished with this one.
 *
 * Neither reaches the card in the feed, which answers "what was said and done
 * here" and has no expiry: a session booked in March is still a thing that
 * happened in March, and clearing its banner is not a claim that it wasn't.
 *
 * @param meeting - The session.
 * @param now     - Reference time, injectable so the tests are not clock-dependent.
 * @returns Whether the strip should draw it.
 */
export function isBannerMeeting(meeting: MeetingView, now: Date = new Date()): boolean {
  if (meeting.bannerDismissed) {
    return false;
  }

  return new Date(meeting.endsAt).getTime() >= now.getTime() - BANNER_LOOKBACK_MS;
}

/** One thing in the chat feed: something somebody said, or a session they booked. */
export type ChatFeedEntry<TMessage> =
  | { kind: 'message'; id: string; at: string; message: TMessage }
  | { kind: 'meeting'; id: string; at: string; meeting: MeetingView };

/**
 * Merges booked sessions into a run of messages, in the order things happened.
 *
 * Generic over the message, because the two chats do not share one: a direct
 * thread has read receipts and an icebreaker flag, a group message has a sender
 * name and a system flag. All this needs from either is an id and a timestamp.
 *
 * SORTED BY TIMESTAMP, TIE-BROKEN BY ID. Two rows written in the same
 * millisecond are rare but not impossible — booking a session and the message
 * that announces it can land together — and without the tie-break their order
 * is whatever the sort happened to do, which is free to differ between the
 * server render and the client one. That is a hydration mismatch, and an
 * arbitrary but *stable* order is what removes it.
 *
 * @param messages - Messages, in any order.
 * @param meetings - Sessions booked from this chat.
 * @returns Every entry, oldest first.
 */
export function buildChatFeed<TMessage extends { id: string; createdAt: string }>(
  messages: TMessage[],
  meetings: MeetingView[],
): ChatFeedEntry<TMessage>[] {
  const entries: ChatFeedEntry<TMessage>[] = [
    ...messages.map(
      (message): ChatFeedEntry<TMessage> => ({
        kind: 'message',
        id: `message-${message.id}`,
        at: message.createdAt,
        message,
      }),
    ),
    ...meetings.map(
      (meeting): ChatFeedEntry<TMessage> => ({
        kind: 'meeting',
        id: `meeting-${meeting.id}`,
        at: meeting.createdAt,
        meeting,
      }),
    ),
  ];

  return entries.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

/**
 * A default title for a session, so the field is never empty on open.
 *
 * The schema requires three characters, and a student who has just found a time
 * should not have to invent a name for it before they can book.
 *
 * @param courseCode - The course the chat is about, when there is one.
 * @returns A title they can accept or replace.
 */
export function defaultMeetingTitle(courseCode: string | null): string {
  return courseCode ? `${courseCode} study session` : 'Study session';
}
