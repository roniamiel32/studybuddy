/**
 * File:        src/features/calendar/free-time.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Turning a list of busy calendar intervals into the weekly
 *              availability rows this app matches on.
 *
 *              PURE, AND THE ONLY PART OF THE INTEGRATION WORTH TESTING. No
 *              network, no database, no clock of its own — busy intervals and a
 *              timezone in, weekday slots out. Everything that can be wrong
 *              about this feature in a way a student would notice is wrong in
 *              here.
 *
 *              THE HARD PART IS THAT THE TWO SIDES DISAGREE ABOUT WHAT TIME IS.
 *              Google hands back absolute instants. `availability_slots` holds a
 *              WEEKLY RECURRING TEMPLATE — a weekday and two wall-clock times —
 *              so "busy 10:00-12:00 on the 24th" has to become a statement about
 *              Mondays in general. Bridging that needs two decisions:
 *
 *              1. WHOSE WALL CLOCK. The calendar's own timezone, not the
 *                 server's and not the browser's. A server in UTC would put a
 *                 Tel Aviv student's 09:00 lecture at 06:00.
 *
 *              2. WHAT "FREE ON MONDAYS" MEANS when the horizon covers two
 *                 Mondays and they differ. This INTERSECTS them: free only if
 *                 free on every observed occurrence. The union would be worse
 *                 than useless — it would advertise time the student is busy,
 *                 and the whole point of the feature is that the slots can be
 *                 trusted enough to book against.
 * Version:     0.46.0
 *
 * Modifications:
 *     0.46.0 - 2026-08-18 - Initial implementation (two-way calendar sync)
 */

/** The earliest a study slot may start, in minutes from midnight. 08:00. */
export const STUDY_WINDOW_START = 8 * 60;

/** The latest a study slot may end. 22:00. */
export const STUDY_WINDOW_END = 22 * 60;

/**
 * Shortest gap worth offering.
 *
 * A nine-minute hole between two lectures is not study time, and emitting it
 * would fill the matcher with slots nobody can use.
 */
export const MIN_SLOT_MINUTES = 30;

/** How far ahead to look. Two weeks gives two of every weekday to intersect. */
export const HORIZON_DAYS = 14;

/** One busy block, as Google reports it. */
export interface BusyInterval {
  /** ISO 8601 instant. */
  start: string;
  /** ISO 8601 instant. */
  end: string;
}

/** One row destined for `availability_slots`. */
export interface FreeSlot {
  /** 0 = Sunday, matching the column's check constraint. */
  dayOfWeek: number;
  /** "HH:MM". */
  startsAt: string;
  /** "HH:MM". */
  endsAt: string;
}

/** A half-open range of minutes from midnight. */
interface MinuteRange {
  start: number;
  end: number;
}

/** A wall-clock reading of an instant in some timezone. */
interface ZonedReading {
  /** Days since the epoch, in that zone. Used only for ordering and grouping. */
  dayNumber: number;
  /** 0 = Sunday. */
  dayOfWeek: number;
  /** Minutes from midnight. */
  minutes: number;
}

/**
 * Reads an instant as wall-clock time in a timezone.
 *
 * `Intl` is doing the timezone work, which is the point: it already knows every
 * offset and every DST transition, and a hand-rolled offset table would be wrong
 * twice a year.
 *
 * @param instant  - The moment to read.
 * @param timeZone - An IANA timezone name.
 * @returns The wall-clock reading.
 */
function readInZone(instant: Date, timeZone: string): ZonedReading {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(instant);

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '0';

  const year = Number(value('year'));
  const month = Number(value('month'));
  const day = Number(value('day'));
  /* 'en-US' with hour12:false renders midnight as 24, not 00. */
  const hour = Number(value('hour')) % 24;
  const minute = Number(value('minute'));

  /*
   * Date.UTC on the *wall-clock* y/m/d gives a stable integer per calendar day
   * in that zone. It is not the real instant and is never used as one — only to
   * number and order days, and to step from one to the next.
   */
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayOfWeek = weekdays.indexOf(value('weekday'));

  return {
    dayNumber,
    /* Fall back to arithmetic if the locale ever renders a weekday we do not
       recognise: 1970-01-01 was a Thursday. */
    dayOfWeek: dayOfWeek >= 0 ? dayOfWeek : (((dayNumber + 4) % 7) + 7) % 7,
    minutes: hour * 60 + minute,
  };
}

/**
 * Subtracts busy ranges from one continuous window.
 *
 * @param window - The window to carve up.
 * @param busy   - Busy ranges, in any order.
 * @returns What is left, in order, with nothing shorter than MIN_SLOT_MINUTES.
 */
export function subtractBusy(window: MinuteRange, busy: MinuteRange[]): MinuteRange[] {
  /* Clip to the window and drop anything outside it before merging. */
  const clipped = busy
    .map((range) => ({
      start: Math.max(range.start, window.start),
      end: Math.min(range.end, window.end),
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);

  /*
   * Merged first. Overlapping meetings are the normal case, not an edge case —
   * a lecture and a reminder for the same lecture — and subtracting them one at
   * a time would reopen the gap the previous one closed.
   */
  const merged: MinuteRange[] = [];

  for (const range of clipped) {
    const last = merged.at(-1);

    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }

  const free: MinuteRange[] = [];
  let cursor = window.start;

  for (const range of merged) {
    if (range.start - cursor >= MIN_SLOT_MINUTES) {
      free.push({ start: cursor, end: range.start });
    }
    cursor = Math.max(cursor, range.end);
  }

  if (window.end - cursor >= MIN_SLOT_MINUTES) {
    free.push({ start: cursor, end: window.end });
  }

  return free;
}

/**
 * Intersects two sets of ranges.
 *
 * @param a - First set, ordered and non-overlapping.
 * @param b - Second set, ordered and non-overlapping.
 * @returns The ranges present in both, minimum length applied.
 */
function intersect(a: MinuteRange[], b: MinuteRange[]): MinuteRange[] {
  const result: MinuteRange[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start);
    const end = Math.min(a[i].end, b[j].end);

    if (end - start >= MIN_SLOT_MINUTES) {
      result.push({ start, end });
    }

    /* Advance whichever ends first; the other may still overlap what follows. */
    if (a[i].end < b[j].end) {
      i++;
    } else {
      j++;
    }
  }

  return result;
}

/**
 * Formats minutes from midnight as "HH:MM".
 *
 * @param minutes - Minutes from midnight.
 * @returns The wall-clock time.
 */
function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Splits a busy interval into per-calendar-day minute ranges.
 *
 * An interval that crosses midnight — an overnight shift, an all-day event —
 * belongs to more than one weekday, and treating it as one range on its start
 * day would leave the following morning wrongly free.
 *
 * @param interval - The busy block.
 * @param timeZone - The calendar's timezone.
 * @returns Ranges keyed by day number.
 */
function splitByDay(
  interval: BusyInterval,
  timeZone: string,
): Array<{ dayNumber: number; dayOfWeek: number; range: MinuteRange }> {
  const startInstant = new Date(interval.start);
  const endInstant = new Date(interval.end);

  if (
    Number.isNaN(startInstant.getTime()) ||
    Number.isNaN(endInstant.getTime()) ||
    endInstant <= startInstant
  ) {
    return [];
  }

  const from = readInZone(startInstant, timeZone);
  const to = readInZone(endInstant, timeZone);
  const out: Array<{ dayNumber: number; dayOfWeek: number; range: MinuteRange }> = [];

  /*
   * Guarded against a runaway interval. A malformed all-day event with a year's
   * duration would otherwise spin here, and no busy block relevant to a
   * fortnight's availability is longer than the horizon.
   */
  const lastDay = Math.min(to.dayNumber, from.dayNumber + HORIZON_DAYS + 1);

  for (let day = from.dayNumber; day <= lastDay; day++) {
    const start = day === from.dayNumber ? from.minutes : 0;
    const end = day === to.dayNumber ? to.minutes : 1440;

    if (end > start) {
      out.push({
        dayNumber: day,
        dayOfWeek: (((from.dayOfWeek + (day - from.dayNumber)) % 7) + 7) % 7,
        range: { start, end },
      });
    }
  }

  return out;
}

/**
 * Computes the weekly free slots implied by a set of busy intervals.
 *
 * @param options - Busy intervals, the calendar's timezone, and the window of
 *                  days the intervals were fetched for.
 * @returns Weekly slots, ordered by day then time.
 */
export function computeFreeSlots(options: {
  busy: BusyInterval[];
  timeZone: string;
  /** First instant of the fetched range. */
  rangeStart: Date;
  /** How many days the range covers. */
  days?: number;
}): FreeSlot[] {
  const days = options.days ?? HORIZON_DAYS;
  const window: MinuteRange = { start: STUDY_WINDOW_START, end: STUDY_WINDOW_END };

  /*
   * The days under consideration are derived from the RANGE, not from the busy
   * list. A weekday with no events at all is a weekday the student is entirely
   * free, and reading the day set off the events would have dropped it —
   * silently turning the emptiest calendar into no availability at all.
   */
  const firstDay = readInZone(options.rangeStart, options.timeZone);
  const busyByDay = new Map<number, MinuteRange[]>();

  for (const interval of options.busy) {
    for (const piece of splitByDay(interval, options.timeZone)) {
      const existing = busyByDay.get(piece.dayNumber);

      if (existing) {
        existing.push(piece.range);
      } else {
        busyByDay.set(piece.dayNumber, [piece.range]);
      }
    }
  }

  /* Free ranges per weekday, intersected across every occurrence in the range. */
  const perWeekday = new Map<number, MinuteRange[]>();

  for (let offset = 0; offset < days; offset++) {
    const dayNumber = firstDay.dayNumber + offset;
    const dayOfWeek = (((firstDay.dayOfWeek + offset) % 7) + 7) % 7;
    const free = subtractBusy(window, busyByDay.get(dayNumber) ?? []);
    const soFar = perWeekday.get(dayOfWeek);

    perWeekday.set(dayOfWeek, soFar === undefined ? free : intersect(soFar, free));
  }

  const slots: FreeSlot[] = [];

  for (const [dayOfWeek, ranges] of [...perWeekday.entries()].sort((a, b) => a[0] - b[0])) {
    for (const range of ranges) {
      slots.push({
        dayOfWeek,
        startsAt: formatTime(range.start),
        endsAt: formatTime(range.end),
      });
    }
  }

  return slots;
}
