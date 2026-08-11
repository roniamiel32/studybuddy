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
 * Version:     0.19.0
 *
 * Modifications:
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
  /** True once it has finished — the point at which rating opens. */
  hasFinished: boolean;
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
