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
 * Version:     1.0.0
 *
 * Modifications:
 *     1.0.0  - 2026-08-25 - clampSlotsToGridRows: an offered slot never crosses
 *                           the grid row it is drawn in
 *     0.53.0 - 2026-08-25 - mergeSlotsIntoBlocks and formatDuration, so the list
 *                           can show a block and still select every slot in it
 *     0.49.0 - 2026-08-19 - buildSlotGrid takes a baseDate, so the picker can
 *                           page between weeks
 *     0.48.0 - 2026-08-19 - isDefaultMeetingTitle and meetingChatHref, for the
 *                           per-recipient calendar title and the clickable rows
 *     0.47.0 - 2026-08-19 - Meeting history view models; the default title names
 *                           the partner instead of a course
 *     0.30.0 - 2026-08-14 - The picker's grid, and merging a multi-slot
 *                           selection into bookable runs (Phase 9H)
 *     0.29.0 - 2026-08-14 - createdAt, the banner window, and feed interleaving
 *                           for the inline session card (Phase 9G)
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7)
 */

/**
 * A bookable window every participant of a chat is free for.
 *
 * Two hours as a rule, and shorter at the edges: the last block of a free span
 * is whatever remains of it, and clampSlotsToGridRows cuts anything that would
 * cross one of the picker's rows. Nothing downstream may assume the length.
 */
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

/* -------------------------------------------------------------------------- */
/* The picker: a week of offered times, and what a selection turns into        */
/* -------------------------------------------------------------------------- */

/** How far ahead the picker looks. One week, as the grid shows. */
export const SCHEDULER_WINDOW_DAYS = 7;

/**
 * The longest a single session may be, matching the meetings_bounded CHECK.
 *
 * Mirrored here rather than discovered by a failed insert, and now high enough
 * that no selection the picker can produce comes near it: the grid offers 08:00
 * to 22:00, so the longest contiguous run a student can pick is fourteen hours.
 * It stays a mirror of the constraint rather than a product rule — if the
 * database's guard against a mistyped date ever moves again, this is where the
 * picker learns about it.
 */
export const MEETING_MAX_HOURS = 24;

/** A local calendar day key — `2026-08-16` in the READER's zone, never UTC. */
function localDayKey(iso: string): string {
  const date = new Date(iso);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/** The time of day a slot starts, as `14:00` in the reader's zone. */
function localTimeKey(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

/** How wide one row of the picker's grid is. */
const GRID_ROW_HOURS = 2;

/** Below this a fragment is a sliver, not a study session, and is not offered. */
const MIN_SLOT_MINUTES = 15;

/**
 * The next two-hour row boundary strictly after an instant, in the reader's zone.
 *
 * @param from - The instant to step forward from.
 * @returns The boundary. 14:00 gives 16:00; 15:20 also gives 16:00.
 */
function nextRowBoundary(from: Date): Date {
  const boundary = new Date(from);

  boundary.setHours(
    Math.floor(from.getHours() / GRID_ROW_HOURS) * GRID_ROW_HOURS + GRID_ROW_HOURS,
    0,
    0,
    0,
  );

  return boundary;
}

/**
 * Re-cuts the offered slots so none of them crosses a grid row.
 *
 * THE BUG THIS EXISTS FOR. rpc_meeting_slots walks each free span in two-hour
 * steps FROM WHERE THE SPAN STARTS, and a span starts wherever the last booking
 * left off. Book 14:00–15:00 and the remaining free time starts at 15:00, so the
 * RPC offers 15:00–17:00 — and buildSlotGrid files it under `floor(15 / 2) * 2`,
 * which is the 14:00 row. The student then presses a cell in the row labelled
 * 14:00 and is asked to confirm a session from 15:00 to 17:00, straddling the
 * 16:00 row, which also still shows a cell of its own.
 *
 * The rows are the contract the grid makes with the reader: a cell in the 14:00
 * row books time inside 14:00–16:00 and nothing else. So the spans are rebuilt
 * and re-cut on those boundaries — 15:00–17:00 becomes 15:00–16:00 in the 14:00
 * row and 16:00–17:00 in the 16:00 row, and no free time is lost in the process.
 *
 * CUT IN THE READER'S ZONE, WHICH IS WHY THIS IS NOT IN SQL. The obvious home
 * for it is rpc_meeting_slots, and that would be wrong: the RPC works in the
 * campus timezone while the grid's rows are built from the reader's local hours,
 * by long-standing decision in this module. Clamping to campus hours would still
 * bleed across rows for a student who is travelling — the one case where getting
 * it wrong is hardest to notice.
 *
 * MERGED FIRST, THEN CUT. Cutting each offered slot where it stands would leave
 * two fragments in one row whenever a span's own two-hour steps straddle a
 * boundary. Rebuilding the contiguous span and cutting that gives exactly one
 * fragment per row it touches.
 *
 * @param slots - Slots as the RPC returned them.
 * @returns Slots that each sit inside a single row, in chronological order.
 */
export function clampSlotsToGridRows(slots: MeetingSlotView[]): MeetingSlotView[] {
  const ordered = [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  /* Back into contiguous spans. Adjacency is exact timestamp equality, the same
     rule the rest of this module uses. */
  const spans: MeetingSlotView[] = [];

  for (const slot of ordered) {
    const open = spans.at(-1);

    if (open && open.endsAt === slot.startsAt) {
      open.endsAt = slot.endsAt;
      continue;
    }

    spans.push({ ...slot });
  }

  const cut: MeetingSlotView[] = [];

  for (const span of spans) {
    let cursor = new Date(span.startsAt);
    const closes = new Date(span.endsAt);

    while (cursor < closes) {
      const boundary = nextRowBoundary(cursor);
      const sliceEnd = boundary < closes ? boundary : closes;

      if (sliceEnd.getTime() - cursor.getTime() >= MIN_SLOT_MINUTES * 60_000) {
        cut.push({
          startsAt: cursor.toISOString(),
          endsAt: sliceEnd.toISOString(),
          participantCount: span.participantCount,
        });
      }

      cursor = sliceEnd;
    }
  }

  return cut;
}

/** One column of the picker's grid: a day, and what is on offer that day. */
export interface SlotGridColumn {
  /** Local calendar day, `2026-08-16`. */
  date: string;
  /** Column heading — "Sun". */
  weekday: string;
  /** Second line of the heading — "16 Aug". */
  dayLabel: string;
  /** Offered slots that day, keyed by their local start time. */
  slotsByTime: Record<string, MeetingSlotView[]>;
}

/** The grid the picker opens on. */
export interface SlotGrid {
  /** One per day in the window, whether or not anything is free. */
  columns: SlotGridColumn[];
  /** Row headings — every start time that appears anywhere, ascending. */
  times: string[];
}

/**
 * Arranges the offered slots into the week grid the picker draws.
 *
 * NOTHING ABOUT THE GRID'S SHAPE COMES FROM THE DATA, and that is the whole
 * point of it. Both axes are fixed before a single slot is read:
 *
 *   THE COLUMNS ARE ONE CALENDAR WEEK, Sunday to Saturday, whichever week
 *   `baseDate` falls in. Every day gets a column even with nothing free, because
 *   an empty column is the answer to "can we meet on Wednesday" — a grid that
 *   silently omitted Wednesday would leave that question open.
 *
 *   THE ROWS ARE THE SAME SEVEN TWO-HOUR BLOCKS EVERY TIME, 08:00 to 20:00.
 *   Deriving them from what was offered made the grid change height between two
 *   loads of the same week, so a cell a student was about to click moved because
 *   somebody else had booked an unrelated evening.
 *
 * BASE DATE IS WHICH WEEK, NOT WHAT TIME IT IS. This used to be `now`, and it
 * was only ever read to find the current week. The picker pages through weeks
 * with `<` and `>` by passing today plus seven days per step, so the argument's
 * job is now to name a week rather than an instant — hence the name. Passing any
 * moment inside a week gives that week; the default is this one. Tests pass a
 * fixed date so nothing here depends on when the suite runs.
 *
 * SLOTS OUTSIDE THE DRAWN WEEK ARE DROPPED, not folded into the nearest column.
 * The fetch window is a rolling seven days from now and does not line up with
 * week boundaries, so on most days some of what came back belongs to the next
 * page — where paging will show it — and the list view shows all of it regardless.
 *
 * @param slots    - Slots as the RPC returned them.
 * @param days     - How many columns to draw, from that week's Sunday.
 * @param baseDate - Any moment in the week to draw. Defaults to this week.
 * @returns The columns and rows to render.
 */
export function buildSlotGrid(
  slots: MeetingSlotView[],
  days: number = 7,
  baseDate: Date = new Date(),
): SlotGrid {
  const columns: SlotGridColumn[] = [];

  const startOfWeek = new Date(baseDate);
  startOfWeek.setDate(baseDate.getDate() - baseDate.getDay());

  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(
      startOfWeek.getFullYear(),
      startOfWeek.getMonth(),
      startOfWeek.getDate() + offset
    );
    columns.push({
      date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(
        day.getDate(),
      ).padStart(2, '0')}`,
      weekday: day.toLocaleDateString(undefined, { weekday: 'short' }),
      dayLabel: day.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      slotsByTime: {},
    });
  }

  const byDate = new Map(columns.map((column) => [column.date, column]));
  const times = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

  for (const slot of slots) {
    const column = byDate.get(localDayKey(slot.startsAt));
    if (!column) continue;

    const timeStr = localTimeKey(slot.startsAt);
    const [hourStr] = timeStr.split(':');
    const baseHour = Math.floor(parseInt(hourStr, 10) / 2) * 2;
    const matchingRowTime = `${String(baseHour).padStart(2, '0')}:00`;

    if (times.includes(matchingRowTime)) {
      if (!column.slotsByTime[matchingRowTime]) {
        column.slotsByTime[matchingRowTime] = [];
      }
      column.slotsByTime[matchingRowTime].push(slot);
    }
  }

  /*
   * The cell draws one slot, so put the longest first.
   *
   * A row normally holds exactly one fragment — clampSlotsToGridRows guarantees
   * that per contiguous span. Two disjoint spans can still touch the same row
   * though, which is what a session booked in the middle of one looks like:
   * 14:00–14:30 free, busy until 15:00, then free again. Offering the longer of
   * the two is the better default, and the list view shows both.
   */
  for (const column of columns) {
    for (const time of Object.keys(column.slotsByTime)) {
      column.slotsByTime[time].sort(
        (a, b) =>
          new Date(b.endsAt).getTime() -
          new Date(b.startsAt).getTime() -
          (new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()),
      );
    }
  }

  return { columns, times };
}

/**
 * One run of back-to-back offered slots, as the list view draws it.
 *
 * WHY THE COVERED SLOTS ARE CARRIED. The list shows a merged block — "13:30 –
 * 21:30" reads far better than four buttons two hours apart — but selection is
 * per slot, because that is the unit the grid works in and the unit
 * mergeSelectedSlots re-merges. A block that displayed a four-slot range and
 * then handed one `startsAt` to the toggle is exactly the mismatch this type
 * exists to prevent: the button said eight hours and the booking was two.
 */
export interface MeetingSlotBlock {
  /** Where the block opens — the first covered slot's start. */
  startsAt: string;
  /** Where it closes — the last covered slot's end. */
  endsAt: string;
  /** The `startsAt` of every slot inside it, in order. Never empty. */
  slotStarts: string[];
}

/**
 * Merges back-to-back offered slots into the blocks the list draws.
 *
 * ADJACENCY IS EXACT TIMESTAMP EQUALITY, the same rule mergeSelectedSlots uses:
 * a block continues only where one slot's end is the next one's start. An hour
 * somebody else has already booked in the middle of an afternoon therefore
 * splits the afternoon in two rather than being swallowed, which is the whole
 * point — the gap is not bookable and a block spanning it would say it was.
 *
 * @param slots - Offered slots, in any order.
 * @returns One entry per contiguous run, in chronological order.
 */
export function mergeSlotsIntoBlocks(slots: MeetingSlotView[]): MeetingSlotBlock[] {
  const ordered = [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const blocks: MeetingSlotBlock[] = [];

  for (const slot of ordered) {
    const open = blocks.at(-1);

    if (open && open.endsAt === slot.startsAt) {
      open.endsAt = slot.endsAt;
      open.slotStarts.push(slot.startsAt);
      continue;
    }

    blocks.push({
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      slotStarts: [slot.startsAt],
    });
  }

  return blocks;
}

/**
 * How long a session actually runs, in words.
 *
 * The picker offers availability and books a meeting, and those are different
 * lengths the moment anybody trims one. Printing the duration beside the times
 * is what stops "13:30 – 21:30" in the list being read as the length of the
 * thing about to be booked.
 *
 * @param startsAt - ISO instant.
 * @param endsAt   - ISO instant.
 * @returns "2h", "1h 30m", "45m".
 */
export function formatDuration(startsAt: string, endsAt: string): string {
  const minutes = Math.max(
    0,
    Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000),
  );

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) {
    return `${rest}m`;
  }

  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** A session the picker will book: one contiguous run of selected slots. */
export interface SelectedRun {
  /** Stable identity, so React keys and fine-tune edits survive a re-render. */
  id: string;
  /** Where the run begins, before any fine-tuning. */
  startsAt: string;
  /** Where it ends. */
  endsAt: string;
  /** How many two-hour blocks it covers. */
  slotCount: number;
}

/**
 * Turns a set of selected slots into the sessions that will actually be booked.
 *
 * CONTIGUOUS SLOTS MERGE; EVERYTHING ELSE SPLITS. Selecting 14–16 and 16–18 on
 * Tuesday books one session from 14:00 to 18:00, because that is plainly what
 * was meant — two calendar entries back to back for the same people in the same
 * room is bookkeeping, not a plan. Tuesday afternoon and Thursday evening stay
 * two sessions, because they are two.
 *
 * ADJACENCY IS EXACT TIMESTAMP EQUALITY, not "same day and roughly next". A run
 * continues only where one slot's end is the next one's start, so an hour that
 * somebody else has already booked in the middle of an afternoon correctly
 * breaks the run in two rather than swallowing the gap.
 *
 * A WHOLE FREE DAY IS ONE SESSION. It used to split at eight hours, because
 * meetings_bounded refused anything longer and a rejection the student could not
 * act on is worse than two calendar entries. The bound is a day now, so the run
 * that a student actually selected is the run that gets booked — the longest the
 * grid can offer is 08:00 to 22:00, which is comfortably inside it.
 *
 * @param slots        - Every offered slot, in any order.
 * @param selectedKeys - The `startsAt` of each selected slot.
 * @returns One entry per session to book, in chronological order.
 */
export function mergeSelectedSlots(
  slots: MeetingSlotView[],
  selectedKeys: string[],
): SelectedRun[] {
  const wanted = new Set(selectedKeys);
  const chosen = slots
    .filter((slot) => wanted.has(slot.startsAt))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const runs: SelectedRun[] = [];

  for (const slot of chosen) {
    /*
     * A SLOT'S OWN END, NOT THE END OF THE GRID ROW IT IS DRAWN IN.
     *
     * This used to clamp each end to `floor(hour / 2) * 2 + 2` — the boundary of
     * the two-hour row buildSlotGrid buckets the slot into — and that broke
     * every slot whose time is not a multiple of two hours, which is every slot
     * derived from a connected calendar. A 13:30–15:30 slot sits in the 12:00
     * row, so its end was pulled back to 14:00 and a two-hour slot became a
     * thirty-minute session.
     *
     * It also made runs unmergeable, which is the half that was harder to see. A
     * run ending at the clamped 14:00 never equals the next slot's 15:30 start,
     * so `continues` was false every time and four contiguous slots came out as
     * four separate thirty-minute sessions instead of one eight-hour one.
     *
     * The row is a display bucket. The slot is the thing being booked.
     */
    const open = runs.at(-1);
    const continues =
      open !== undefined &&
      open.endsAt === slot.startsAt &&
      /* Same calendar day in the reader's zone. Midnight is a boundary people
         think in, and a session that runs through it reads as two. */
      localDayKey(open.startsAt) === localDayKey(slot.startsAt);

    if (continues) {
      open.endsAt = slot.endsAt;
      open.slotCount += 1;
      continue;
    }

    runs.push({
      id: slot.startsAt,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      slotCount: 1,
    });
  }

  return runs;
}
/** The bare fallback, when there is no name to build a title around. */
export const BARE_MEETING_TITLE = 'Study session';

/** What defaultMeetingTitle produces, so one can be recognised again later. */
const DEFAULT_TITLE_PREFIX = 'Study session with ';

/**
 * A default title for a session, so the field is never empty on open.
 *
 * The schema requires three characters, and a student who has just found a time
 * should not have to invent a name for it before they can book.
 *
 * THE SAME STRING IS USED BY THE SERVER. `createMeeting` falls back to this when
 * the field arrives empty, so the title in the database is the one the picker
 * offered rather than a second, differently-worded default.
 *
 * @returns A title they can accept or replace.
 */
export function defaultMeetingTitle(partnerName?: string): string {
  return BARE_MEETING_TITLE;
}

/**
 * Whether a stored title is one this app wrote rather than one a student did.
 *
 * THE CALENDAR SYNC IS THE ONLY CALLER, and it needs this because it rewrites
 * the title per recipient. Rewriting a title a student actually typed would be a 
 * different thing entirely: "Past papers" is information the organiser chose to record, 
 * and replacing it loses it. So only the generated defaults are eligible, 
 * and anything else goes to Google exactly as stored.
 *
 * @param title - The title on the meeting row.
 * @returns Whether it is a default this app generated.
 */
export function isDefaultMeetingTitle(title: string): boolean {
  const trimmed = title.trim();

  return trimmed === BARE_MEETING_TITLE || trimmed.startsWith(DEFAULT_TITLE_PREFIX);
}
/* -------------------------------------------------------------------------- */
/* Meeting history                                                            */
/* -------------------------------------------------------------------------- */

/** One other person who was on the invitation list. */
export interface MeetingPartnerView {
  profileId: string;
  /** Their name, or 'Classmate' when their profile is not visible to the viewer. */
  fullName: string;
  avatarUrl: string | null;
  /** Whether they were still coming. False once they stepped out. */
  going: boolean;
}

/**
 * One row of the private Meeting History on a student's own profile.
 *
 * DELIBERATELY WIDER THAN THE SCREEN NEEDS. The list renders the stamp and the
 * partner, but the counting this is meant to feed later — sessions kept, hours
 * studied, who you actually study with — needs the durations, the RSVPs and the
 * cancellations too, and adding them now costs nothing: they are columns of a
 * row already being read. `summariseMeetingHistory` below is the first reader.
 */
export interface MeetingHistoryEntry {
  id: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  /** Which chat it was booked from — a one-to-one, or a group. */
  scope: 'direct' | 'group';
  /** The conversation it was booked from, for a one-to-one. */
  conversationId: string | null;
  /** The group it was booked from, for a group session. */
  groupId: string | null;
  /** Everyone on the list except the viewer. Empty only for a stranded session. */
  partners: MeetingPartnerView[];
  /** Whether the viewer is still going. False once they cancel their own place. */
  going: boolean;
  /** Whether the viewer booked it. */
  isOrganiser: boolean;
  /**
   * Whether the whole session was called off, which is not the same as leaving it.
   *
   * ALWAYS FALSE OUT OF getMyMeetingHistory, which filters cancellations out at
   * the query. Kept on the model because it is a faithful reading of the row's
   * status, and because summariseMeetingHistory must not count one if a future
   * caller does pass them in.
   */
  cancelled: boolean;
  /** Whether it has already finished. Computed on the server — see MeetingView. */
  hasFinished: boolean;
  createdAt: string;
}

/** The history split the way the page reads it. */
export interface MeetingHistoryGroups {
  /** Soonest first, because the next one is the one you came to check. */
  upcoming: MeetingHistoryEntry[];
  /** Most recent first, because history is read backwards. */
  past: MeetingHistoryEntry[];
}

/**
 * Splits the history into what is still ahead and what has already happened.
 *
 * Split HERE rather than in two queries: it is one read of one table, and the
 * boundary is a clock reading that the page should not have to send to the
 * database. `hasFinished` comes from the server for the same reason MeetingView
 * carries it — a session that ends between render and hydration must not change
 * sides underneath React.
 *
 * @param entries - The viewer's sessions, in ascending time order.
 * @returns The two lists, each in its own reading order.
 */
export function splitMeetingHistory(entries: MeetingHistoryEntry[]): MeetingHistoryGroups {
  const upcoming: MeetingHistoryEntry[] = [];
  const past: MeetingHistoryEntry[] = [];

  for (const entry of entries) {
    (entry.hasFinished ? past : upcoming).push(entry);
  }

  return { upcoming, past: past.reverse() };
}

/** Headline numbers over a student's own history. */
export interface MeetingHistorySummary {
  total: number;
  upcoming: number;
  /** Finished, not cancelled, and the student had not stepped out — sessions they actually sat. */
  attended: number;
  /** Hours of attended sessions, to one decimal place. */
  hoursStudied: number;
  /** How many different people they have booked a session with. */
  distinctPartners: number;
}

/**
 * Counts a history.
 *
 * The statistics screen does not exist yet; this is where its numbers will come
 * from when it does, and having it here means the definition of "attended" is
 * written down once rather than re-invented by whoever builds that screen. It is
 * a pure function over the entries, so it is equally usable from a page, a test,
 * or a future dashboard card.
 *
 * @param entries - The viewer's sessions.
 * @returns The counts.
 */
export function summariseMeetingHistory(
  entries: MeetingHistoryEntry[],
): MeetingHistorySummary {
  const partners = new Set<string>();
  let upcoming = 0;
  let attended = 0;
  let minutes = 0;

  for (const entry of entries) {
    for (const partner of entry.partners) {
      partners.add(partner.profileId);
    }

    if (entry.cancelled) {
      continue;
    }

    if (!entry.hasFinished) {
      if (entry.going) {
        upcoming += 1;
      }

      continue;
    }

    if (entry.going) {
      attended += 1;
      minutes += (new Date(entry.endsAt).getTime() - new Date(entry.startsAt).getTime()) / 60_000;
    }
  }

  return {
    total: entries.length,
    upcoming,
    attended,
    hoursStudied: Math.round(minutes / 6) / 10,
    distinctPartners: partners.size,
  };
}

/**
 * Where a session's chat lives.
 *
 * THE ROW IS A LINK BECAUSE THE CHAT IS WHERE EVERYTHING ELSE ABOUT A SESSION
 * IS. Details, the other people's RSVPs, cancelling, and — the case this is
 * really for — changing your mind after you stepped out, which has no control
 * anywhere on the history page and does not need one now.
 *
 * @param entry - The session.
 * @returns The chat's path, or null when the chat is gone.
 */
export function meetingChatHref(entry: MeetingHistoryEntry): string | null {
  if (entry.groupId) {
    return `/groups/${entry.groupId}`;
  }

  return entry.conversationId ? `/messages/${entry.conversationId}` : null;
}

/**
 * The partners of one session as a single readable phrase.
 *
 * "Dana Levi", "Dana Levi and Omer Katz", "Dana Levi, Omer Katz and 2 others" —
 * a group session should not push a row three lines tall.
 *
 * @param partners - Everyone but the viewer.
 * @returns The phrase, or 'No one else' for a session nobody else is left on.
 */
export function formatMeetingPartners(partners: MeetingPartnerView[]): string {
  const names = partners.map((partner) => partner.fullName);

  if (names.length === 0) {
    return 'No one else';
  }

  if (names.length === 1) {
    return names[0];
  }

  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }

  const others = names.length - 2;

  return `${names[0]}, ${names[1]} and ${others} ${others === 1 ? 'other' : 'others'}`;
}
