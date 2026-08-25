/**
 * File:        tests/unit/calendar-free-time.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Unit tests for the calendar read sync's arithmetic.
 *
 *              This is the only part of the integration that can be tested
 *              without Google on the other end, and it is also the part where a
 *              mistake is invisible: a wrong timezone or a mishandled midnight
 *              produces availability that looks perfectly plausible and is wrong
 *              by hours. The cases below are weighted towards the ways it could
 *              silently lie — advertising busy time as free, losing a day with no
 *              events, and reading a Tel Aviv calendar on a UTC server.
 * Version:     0.46.0
 *
 * Modifications:
 *     0.46.0 - 2026-08-18 - Initial implementation (two-way calendar sync)
 */

import { describe, expect, it } from 'vitest';

import {
  computeFreeSlots,
  MIN_SLOT_MINUTES,
  STUDY_WINDOW_END,
  STUDY_WINDOW_START,
  subtractBusy,
  type BusyInterval,
} from '@/features/calendar/free-time';

const WINDOW = { start: STUDY_WINDOW_START, end: STUDY_WINDOW_END };

describe('subtractBusy', () => {
  it('returns the whole window when nothing is busy', () => {
    expect(subtractBusy(WINDOW, [])).toEqual([{ start: 480, end: 1320 }]);
  });

  it('splits the window around one busy block', () => {
    expect(subtractBusy(WINDOW, [{ start: 600, end: 720 }])).toEqual([
      { start: 480, end: 600 },
      { start: 720, end: 1320 },
    ]);
  });

  it('merges overlapping busy blocks before subtracting', () => {
    // A lecture and a reminder for the same lecture. Subtracting one at a time
    // would reopen the gap the previous one closed.
    expect(
      subtractBusy(WINDOW, [
        { start: 600, end: 720 },
        { start: 660, end: 780 },
      ]),
    ).toEqual([
      { start: 480, end: 600 },
      { start: 780, end: 1320 },
    ]);
  });

  it('handles busy blocks given out of order', () => {
    expect(
      subtractBusy(WINDOW, [
        { start: 900, end: 960 },
        { start: 600, end: 660 },
      ]),
    ).toEqual([
      { start: 480, end: 600 },
      { start: 660, end: 900 },
      { start: 960, end: 1320 },
    ]);
  });

  it('clips busy time that falls outside the study window', () => {
    // A 06:00 gym class says nothing about 08:00-22:00.
    expect(subtractBusy(WINDOW, [{ start: 360, end: 420 }])).toEqual([
      { start: 480, end: 1320 },
    ]);
  });

  it('drops gaps shorter than the minimum useful slot', () => {
    // Nine minutes between two lectures is not study time.
    const free = subtractBusy(WINDOW, [
      { start: 480, end: 600 },
      { start: 609, end: 1320 },
    ]);

    expect(free).toEqual([]);
  });

  it('keeps a gap exactly at the minimum', () => {
    const free = subtractBusy(WINDOW, [
      { start: 480, end: 600 },
      { start: 600 + MIN_SLOT_MINUTES, end: 1320 },
    ]);

    expect(free).toEqual([{ start: 600, end: 600 + MIN_SLOT_MINUTES }]);
  });

  it('returns nothing when the whole window is busy', () => {
    expect(subtractBusy(WINDOW, [{ start: 0, end: 1440 }])).toEqual([]);
  });
});

describe('computeFreeSlots', () => {
  /* A Sunday, so day 0 in our weekday numbering. */
  const sunday = new Date('2026-08-23T00:00:00Z');

  it('gives a fully free window for every weekday when the calendar is empty', () => {
    const slots = computeFreeSlots({
      busy: [],
      timeZone: 'UTC',
      rangeStart: sunday,
      days: 7,
    });

    expect(slots).toHaveLength(7);
    expect(new Set(slots.map((slot) => slot.dayOfWeek))).toEqual(
      new Set([0, 1, 2, 3, 4, 5, 6]),
    );
    expect(slots[0]).toEqual({ dayOfWeek: 0, startsAt: '08:00', endsAt: '22:00' });
  });

  it('does not lose a weekday that has no events at all', () => {
    // The day set comes from the RANGE, not from the events. Reading it off the
    // events would turn the emptiest calendar into no availability at all.
    const slots = computeFreeSlots({
      busy: [{ start: '2026-08-24T09:00:00Z', end: '2026-08-24T11:00:00Z' }],
      timeZone: 'UTC',
      rangeStart: sunday,
      days: 7,
    });

    expect(slots.some((slot) => slot.dayOfWeek === 3)).toBe(true);
  });

  it('subtracts a busy block from the right weekday', () => {
    const slots = computeFreeSlots({
      busy: [{ start: '2026-08-24T09:00:00Z', end: '2026-08-24T11:00:00Z' }],
      timeZone: 'UTC',
      rangeStart: sunday,
      days: 7,
    });

    /* The 24th is a Monday. */
    expect(slots.filter((slot) => slot.dayOfWeek === 1)).toEqual([
      { dayOfWeek: 1, startsAt: '08:00', endsAt: '09:00' },
      { dayOfWeek: 1, startsAt: '11:00', endsAt: '22:00' },
    ]);
  });

  it('reads busy times in the calendar’s timezone, not the server’s', () => {
    // 06:00Z is 09:00 in Jerusalem (UTC+3 in August). Treating it as UTC would
    // put this lecture outside the study window entirely and report the whole
    // day free.
    const slots = computeFreeSlots({
      busy: [{ start: '2026-08-24T06:00:00Z', end: '2026-08-24T08:00:00Z' }],
      timeZone: 'Asia/Jerusalem',
      rangeStart: sunday,
      days: 7,
    });

    expect(slots.filter((slot) => slot.dayOfWeek === 1)).toEqual([
      { dayOfWeek: 1, startsAt: '08:00', endsAt: '09:00' },
      { dayOfWeek: 1, startsAt: '11:00', endsAt: '22:00' },
    ]);
  });

  it('intersects two occurrences of the same weekday', () => {
    // Busy 09:00-11:00 on the first Monday and 14:00-15:00 on the second. Only
    // time free on BOTH may be offered, or the slot cannot be booked against.
    const slots = computeFreeSlots({
      busy: [
        { start: '2026-08-24T09:00:00Z', end: '2026-08-24T11:00:00Z' },
        { start: '2026-08-31T14:00:00Z', end: '2026-08-31T15:00:00Z' },
      ],
      timeZone: 'UTC',
      rangeStart: sunday,
      days: 14,
    });

    expect(slots.filter((slot) => slot.dayOfWeek === 1)).toEqual([
      /* Free on both Mondays: before the first Monday's lecture... */
      { dayOfWeek: 1, startsAt: '08:00', endsAt: '09:00' },
      /* ...between the first one's end and the second one's start... */
      { dayOfWeek: 1, startsAt: '11:00', endsAt: '14:00' },
      /* ...and after the second one. */
      { dayOfWeek: 1, startsAt: '15:00', endsAt: '22:00' },
    ]);
  });

  it('never advertises time the student is busy on one of the occurrences', () => {
    // The union would offer Monday 09:00-11:00 because the second Monday is
    // free then. Intersection is the whole point.
    const slots = computeFreeSlots({
      busy: [{ start: '2026-08-24T00:00:00Z', end: '2026-08-25T00:00:00Z' }],
      timeZone: 'UTC',
      rangeStart: sunday,
      days: 14,
    });

    expect(slots.filter((slot) => slot.dayOfWeek === 1)).toEqual([]);
  });

  it('splits an event that crosses midnight across both weekdays', () => {
    // An overnight shift. Treating it as one range on its start day would leave
    // the following morning wrongly free.
    const slots = computeFreeSlots({
      busy: [{ start: '2026-08-24T20:00:00Z', end: '2026-08-25T10:00:00Z' }],
      timeZone: 'UTC',
      rangeStart: sunday,
      days: 7,
    });

    expect(slots.filter((slot) => slot.dayOfWeek === 1)).toEqual([
      { dayOfWeek: 1, startsAt: '08:00', endsAt: '20:00' },
    ]);
    expect(slots.filter((slot) => slot.dayOfWeek === 2)).toEqual([
      { dayOfWeek: 2, startsAt: '10:00', endsAt: '22:00' },
    ]);
  });

  it('handles an all-day event as a fully busy day', () => {
    const slots = computeFreeSlots({
      busy: [{ start: '2026-08-25T00:00:00Z', end: '2026-08-26T00:00:00Z' }],
      timeZone: 'UTC',
      rangeStart: sunday,
      days: 7,
    });

    expect(slots.filter((slot) => slot.dayOfWeek === 2)).toEqual([]);
  });

  it('ignores malformed and inverted intervals rather than throwing', () => {
    const busy: BusyInterval[] = [
      { start: 'not-a-date', end: '2026-08-24T10:00:00Z' },
      { start: '2026-08-24T12:00:00Z', end: '2026-08-24T10:00:00Z' },
    ];

    const slots = computeFreeSlots({ busy, timeZone: 'UTC', rangeStart: sunday, days: 7 });

    expect(slots.filter((slot) => slot.dayOfWeek === 1)).toEqual([
      { dayOfWeek: 1, startsAt: '08:00', endsAt: '22:00' },
    ]);
  });

  it('emits times the availability column can accept', () => {
    const slots = computeFreeSlots({
      busy: [{ start: '2026-08-24T09:17:00Z', end: '2026-08-24T10:43:00Z' }],
      timeZone: 'UTC',
      rangeStart: sunday,
      days: 7,
    });

    for (const slot of slots) {
      expect(slot.startsAt).toMatch(/^\d{2}:\d{2}$/);
      expect(slot.endsAt).toMatch(/^\d{2}:\d{2}$/);
      /* The table's ordering check. */
      expect(slot.endsAt > slot.startsAt).toBe(true);
      expect(slot.dayOfWeek).toBeGreaterThanOrEqual(0);
      expect(slot.dayOfWeek).toBeLessThanOrEqual(6);
    }
  });

  it('never emits a slot outside the 08:00-22:00 study window', () => {
    const slots = computeFreeSlots({
      busy: [{ start: '2026-08-24T12:00:00Z', end: '2026-08-24T13:00:00Z' }],
      timeZone: 'UTC',
      rangeStart: sunday,
      days: 7,
    });

    for (const slot of slots) {
      expect(slot.startsAt >= '08:00').toBe(true);
      expect(slot.endsAt <= '22:00').toBe(true);
    }
  });
});
