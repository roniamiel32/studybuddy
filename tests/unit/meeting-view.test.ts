/**
 * File:        tests/unit/meeting-view.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The pure half of Phase 9G — what the strip keeps out, and how a
 *              booked session takes its place among the messages.
 *
 *              THE ORDERING TEST IS THE ONE WITH TEETH. buildChatFeed is sorted
 *              by timestamp and tied-broken by id, and the tie-break is not
 *              decoration: two rows written in the same millisecond would
 *              otherwise come back in whatever order the sort happened to leave
 *              them, which is free to differ between the server render and the
 *              client one. That is a hydration mismatch, and it is exactly the
 *              kind of bug that reproduces on someone else's machine only.
 *
 *              Times are injected rather than taken from the clock, so none of
 *              this depends on when the suite runs.
 * Version:     1.1.0
 *
 * Modifications:
 *     1.1.0  - 2026-09-01 - campusToday, which is what marks today's column
 *     0.49.0 - 2026-08-19 - Paging: buildSlotGrid takes a baseDate naming a week
 *     0.48.0 - 2026-08-19 - buildSlotGrid now anchors on the week's Sunday and
 *                           draws a fixed set of rows; assertions follow
 *     0.29.0 - 2026-08-14 - Initial tests (Phase 9G)
 */

import { describe, expect, it } from 'vitest';

import {
  MEETING_MAX_HOURS,
  buildChatFeed,
  buildSlotGrid,
  campusToday,
  clampSlotsToGridRows,
  formatDuration,
  formatMeetingWhen,
  formatSlotRange,
  groupSlotsByDay,
  isBannerMeeting,
  mergeSelectedSlots,
  mergeSlotsIntoBlocks,
  type MeetingSlotView,
  type MeetingView,
} from '@/features/meetings/meeting-view';

const NOW = new Date('2026-08-14T12:00:00Z');

/**
 * Builds a meeting view, with everything not under test held constant.
 *
 * @param overrides - The fields the test cares about.
 * @returns A meeting view.
 */
function meeting(overrides: Partial<MeetingView> = {}): MeetingView {
  return {
    id: 'meeting-1',
    title: 'Revision session',
    location: null,
    startsAt: '2026-08-14T09:00:00Z',
    endsAt: '2026-08-14T11:00:00Z',
    going: true,
    otherAttendees: 1,
    isOrganiser: false,
    hasFinished: true,
    createdAt: '2026-08-13T09:00:00Z',
    bannerDismissed: false,
    seriesId: null,
    ...overrides,
  };
}

describe('isBannerMeeting', () => {
  it('keeps a session that is still ahead', () => {
    expect(
      isBannerMeeting(meeting({ endsAt: '2026-08-20T11:00:00Z', hasFinished: false }), NOW),
    ).toBe(true);
  });

  it('keeps one that finished within the last day', () => {
    /* The window that lets the chat offer rating right after a session, which
       is when people most want to say something about it. */
    expect(isBannerMeeting(meeting({ endsAt: '2026-08-14T11:00:00Z' }), NOW)).toBe(true);
  });

  it('drops one that finished more than a day ago', () => {
    expect(isBannerMeeting(meeting({ endsAt: '2026-08-13T09:00:00Z' }), NOW)).toBe(false);
  });

  it('drops one the viewer has dismissed, however recent', () => {
    /* Dismissal beats the age window: a session that ended ten minutes ago is
       gone from the banner the moment its X is clicked. */
    expect(
      isBannerMeeting(
        meeting({ endsAt: '2026-08-14T11:50:00Z', bannerDismissed: true }),
        NOW,
      ),
    ).toBe(false);
  });

  it('drops a dismissed session that has not even happened yet', () => {
    /*
     * Not reachable through the interface — the X is not drawn before a session
     * ends, and the INSERT policy refuses it too. Asserted anyway so the
     * precedence between the two conditions is written down rather than implied.
     */
    expect(
      isBannerMeeting(
        meeting({ endsAt: '2026-08-20T11:00:00Z', hasFinished: false, bannerDismissed: true }),
        NOW,
      ),
    ).toBe(false);
  });
});

describe('buildChatFeed', () => {
  const messages = [
    { id: 'm1', createdAt: '2026-08-13T08:00:00Z' },
    { id: 'm2', createdAt: '2026-08-13T10:00:00Z' },
    { id: 'm3', createdAt: '2026-08-13T12:00:00Z' },
  ];

  it('places a session at the moment it was booked, not when it starts', () => {
    /*
     * The distinction the whole card rests on. Ordering by startsAt would throw
     * a session booked this morning for next Tuesday to the bottom of the feed,
     * below messages nobody had sent when it was scheduled.
     */
    const feed = buildChatFeed(
      messages,
      [meeting({ createdAt: '2026-08-13T09:00:00Z', startsAt: '2026-08-20T09:00:00Z' })],
    );

    expect(feed.map((entry) => entry.id)).toEqual([
      'message-m1',
      'meeting-meeting-1',
      'message-m2',
      'message-m3',
    ]);
  });

  it('tags each entry so the renderer can tell them apart', () => {
    const feed = buildChatFeed(messages, [meeting({ createdAt: '2026-08-13T09:00:00Z' })]);

    expect(feed.map((entry) => entry.kind)).toEqual([
      'message',
      'meeting',
      'message',
      'message',
    ]);
  });

  it('orders a tie by id, so the server and the client agree', () => {
    /* Same millisecond, fed in opposite orders: the result must not change. */
    const at = '2026-08-13T09:00:00Z';
    const one = meeting({ id: 'aaa', createdAt: at });
    const two = meeting({ id: 'bbb', createdAt: at });

    expect(buildChatFeed([], [one, two]).map((entry) => entry.id)).toEqual([
      'meeting-aaa',
      'meeting-bbb',
    ]);
    expect(buildChatFeed([], [two, one]).map((entry) => entry.id)).toEqual([
      'meeting-aaa',
      'meeting-bbb',
    ]);
  });

  it('sorts messages that arrive out of order', () => {
    const feed = buildChatFeed([messages[2], messages[0], messages[1]], []);

    expect(feed.map((entry) => entry.id)).toEqual(['message-m1', 'message-m2', 'message-m3']);
  });

  it('keeps a dismissed session in the feed', () => {
    /*
     * The whole point of the flag. Dismissing clears the banner; the card is a
     * record of something that happened in this chat and stays put.
     */
    const feed = buildChatFeed(messages, [
      meeting({ createdAt: '2026-08-13T09:00:00Z', bannerDismissed: true }),
    ]);

    expect(feed.filter((entry) => entry.kind === 'meeting')).toHaveLength(1);
  });

  it('handles a chat with no messages and a chat with no sessions', () => {
    expect(buildChatFeed([], [])).toEqual([]);
    expect(buildChatFeed(messages, [])).toHaveLength(3);
    expect(buildChatFeed([], [meeting()])).toHaveLength(1);
  });
});

/*
 * The picker works entirely in the reader's own zone, so these fixtures are
 * built from LOCAL date components rather than from UTC strings. Anything
 * hard-coded as "2026-08-16T14:00:00Z" would land on a different row, and
 * sometimes a different day, depending on the machine running the suite.
 */
/**
 * An instant at a given Israeli wall-clock time in August/September 2026.
 *
 * WRITTEN IN CAMPUS TIME ON PURPOSE, and this is what makes the file a guard
 * rather than a mirror. Fixtures used to be built with `new Date(2026, 7, 16,
 * 14, 0)`, which means "14:00 wherever this machine happens to be" — so the
 * fixture and the assertion moved together and the suite passed in every zone
 * while the product was three hours out on a UTC server. Stating the offset
 * pins the instant, so these tests fail if the code ever goes back to reading
 * the ambient zone.
 *
 * +03:00 is Israel Daylight Time, which covers every date used here.
 *
 * @param day    - Day of August 2026. Values past 31 roll into September.
 * @param hour   - Israeli wall-clock hour.
 * @param minute - Israeli wall-clock minute.
 * @returns The instant.
 */
function campus(day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 7, day, hour - 3, minute));
}

const GRID_ANCHOR = campus(16, 9);

/* The same week, seen from the Wednesday. The grid must snap back to the 16th. */
const MIDWEEK_ANCHOR = campus(19, 9);

/* One page forward — what the picker passes when "Next week >" is pressed. */
const NEXT_WEEK_ANCHOR = campus(23, 9);

/*
 * The grid's rows are FIXED — 08:00 to 20:00 in two-hour steps — rather than
 * derived from whatever happens to be offered. A week whose row count changed
 * with the answer moved every cell whenever somebody else booked something,
 * which is what these assertions are pinning down.
 */
const GRID_TIMES = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

/**
 * A two-hour offered slot, at a local hour on a day relative to the anchor.
 *
 * @param daysAhead - Days after the anchor.
 * @param hour      - Local start hour.
 * @returns The slot.
 */
function slotAt(daysAhead: number, hour: number): MeetingSlotView {
  const start = campus(16 + daysAhead, hour);

  return {
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 7_200_000).toISOString(),
    participantCount: 2,
  };
}

describe('the campus clock', () => {
  /*
   * ABSOLUTE INSTANTS, ASSERTED AGAINST ISRAELI WALL-CLOCK TIMES. Nothing here
   * is built from the machine's zone, so these expectations hold whether the
   * suite runs on a laptop in Tel Aviv or on a UTC build server — which is
   * exactly the difference that made a session read 14:00 locally and 11:00 on
   * Vercel. If anybody reintroduces an ambient-zone formatter, this fails first.
   */
  const elevenUtc = '2026-09-01T11:00:00.000Z';
  const thirteenUtc = '2026-09-01T13:00:00.000Z';

  it('formats an instant as Israel sees it', () => {
    expect(formatSlotRange(elevenUtc, thirteenUtc)).toBe('14:00 – 16:00');
  });

  it('stamps a session with the Israeli day and time', () => {
    expect(formatMeetingWhen(elevenUtc, thirteenUtc)).toContain('14:00 – 16:00');
  });

  it('buckets into the Israeli grid row, not the ambient one', () => {
    /* 11:00 UTC is 14:00 in Israel, so it belongs to the 14:00 row. Read in
       UTC it would land in the 10:00 row — three hours and two rows out. */
    const grid = buildSlotGrid(
      [{ startsAt: elevenUtc, endsAt: thirteenUtc, participantCount: 2 }],
      7,
      new Date('2026-09-01T09:00:00.000Z'),
    );

    const filled = grid.columns.filter((column) => Object.keys(column.slotsByTime).length > 0);

    expect(filled).toHaveLength(1);
    expect(Object.keys(filled[0].slotsByTime)).toEqual(['14:00']);
  });

  it('groups onto the Israeli calendar day', () => {
    /* 21:30 UTC on the 1st is 00:30 on the 2nd in Israel — a different day. */
    const days = groupSlotsByDay([
      { startsAt: '2026-09-01T21:30:00.000Z', endsAt: '2026-09-01T23:30:00.000Z', participantCount: 2 },
    ]);

    expect(days[0].date).toBe('2026-09-02');
  });
});

describe('campusToday', () => {
  /*
   * THE COMPARISON THE GRID MAKES IS A STRING COMPARISON, and these are the
   * three properties it rests on: the key is the campus date rather than the
   * machine's, the time of day is not in it, and the format sorts the way dates
   * do. Get any of the three wrong and a column is marked as today for the wrong
   * three hours of the day, or struck through while it is still bookable.
   */
  it('reads the campus date, not the machine zone', () => {
    /* 21:30 UTC on the 1st is 00:30 on the 2nd in Israel. */
    expect(campusToday(new Date('2026-09-01T21:30:00.000Z'))).toBe('2026-09-02');
  });

  it('ignores the time of day', () => {
    const earlyMorning = campusToday(new Date('2026-09-01T05:00:00.000Z'));
    const lateEvening = campusToday(new Date('2026-09-01T18:00:00.000Z'));

    expect(earlyMorning).toBe('2026-09-01');
    expect(lateEvening).toBe(earlyMorning);
  });

  it('sorts as a date does, which is how "before today" is asked', () => {
    const yesterday = campusToday(new Date('2026-08-31T09:00:00.000Z'));
    const today = campusToday(new Date('2026-09-01T09:00:00.000Z'));
    const tomorrow = campusToday(new Date('2026-09-02T09:00:00.000Z'));

    expect(yesterday < today).toBe(true);
    expect(tomorrow < today).toBe(false);
  });

  it('is the same key a grid column carries', () => {
    /* The two have to agree exactly, or no column ever matches today. */
    const noon = new Date('2026-09-01T09:00:00.000Z');
    const grid = buildSlotGrid([], 7, noon);

    expect(grid.columns.map((column) => column.date)).toContain(campusToday(noon));
  });
});

describe('buildSlotGrid', () => {
  it('gives every day in the window a column, free or not', () => {
    /* A grid that silently omitted Wednesday would leave "can we meet on
       Wednesday" unanswered rather than answered with "no". */
    const grid = buildSlotGrid([slotAt(0, 14)], 7, GRID_ANCHOR);

    expect(grid.columns).toHaveLength(7);
    expect(grid.columns[0].slotsByTime['14:00']).toBeDefined();
    expect(grid.columns[3].slotsByTime).toEqual({});
  });

  it('starts the week on Sunday, whatever day it is asked on', () => {
    /*
     * THE PROPERTY THE GRID IS BUILT ON. Called on the Wednesday, it must draw
     * the same seven columns as it does on the Sunday — a week that slid
     * forward with the clock would put the same hour under a different heading
     * every day, and two students comparing screens would not be looking at the
     * same grid.
     */
    const fromSunday = buildSlotGrid([], 7, GRID_ANCHOR);
    const fromWednesday = buildSlotGrid([], 7, MIDWEEK_ANCHOR);

    expect(fromWednesday.columns.map((column) => column.date)).toEqual(
      fromSunday.columns.map((column) => column.date),
    );
    expect(fromSunday.columns[0].date).toBe('2026-08-16');
    expect(fromSunday.columns[6].date).toBe('2026-08-22');
  });

  it('draws the following week when the base date is a week on', () => {
    /*
     * WHAT THE `>` BUTTON DOES. The picker pages by handing this today plus
     * seven days, so the argument names a week rather than an instant — and the
     * page it names must be the next seven columns, still Sunday to Saturday.
     */
    const next = buildSlotGrid([], 7, NEXT_WEEK_ANCHOR);

    expect(next.columns[0].date).toBe('2026-08-23');
    expect(next.columns[6].date).toBe('2026-08-29');
    /* Same rows on every page: the ladder is the shape of a day, not of a week. */
    expect(next.times).toEqual(GRID_TIMES);
  });

  it('leaves this week’s slots off next week’s page, and the other way round', () => {
    /*
     * The two pages must not both claim the same slot. The fetch window is a
     * rolling seven days and does not line up with week boundaries, so on most
     * days part of the answer belongs to each page — which is the whole reason
     * paging was added rather than widening one grid.
     */
    const thisWeek = slotAt(1, 14);
    const nextWeek = slotAt(8, 14);

    const first = buildSlotGrid([thisWeek, nextWeek], 7, GRID_ANCHOR);
    const second = buildSlotGrid([thisWeek, nextWeek], 7, NEXT_WEEK_ANCHOR);

    const filled = (grid: ReturnType<typeof buildSlotGrid>) =>
      grid.columns.filter((column) => Object.keys(column.slotsByTime).length > 0);

    expect(filled(first)).toHaveLength(1);
    expect(filled(first)[0].date).toBe('2026-08-17');

    expect(filled(second)).toHaveLength(1);
    expect(filled(second)[0].date).toBe('2026-08-24');
  });

  it('draws the same seven rows whatever is offered', () => {
    /*
     * Rows are the shape of a day, not a summary of the answer. Deriving them
     * from the offered slots made the grid change height between two loads of
     * the same week, which moved every cell a student had just been looking at.
     */
    const grid = buildSlotGrid([slotAt(0, 14), slotAt(1, 10), slotAt(2, 14)], 7, GRID_ANCHOR);

    expect(grid.times).toEqual(GRID_TIMES);
  });

  it('puts the same hour on different days in one row', () => {
    /* The property the whole grid rests on: a row is an hour, across the week. */
    const grid = buildSlotGrid([slotAt(0, 14), slotAt(2, 14)], 7, GRID_ANCHOR);

    expect(grid.columns[0].slotsByTime['14:00']).toBeDefined();
    expect(grid.columns[1].slotsByTime['14:00']).toBeUndefined();
    expect(grid.columns[2].slotsByTime['14:00']).toBeDefined();
  });

  it('drops a slot beyond the window rather than inventing a column', () => {
    const grid = buildSlotGrid([slotAt(0, 14), slotAt(30, 14)], 7, GRID_ANCHOR);

    expect(grid.columns).toHaveLength(7);
    expect(
      grid.columns.filter((column) => Object.keys(column.slotsByTime).length > 0),
    ).toHaveLength(1);
  });

  it('keeps its shape when nothing is shared', () => {
    /* An empty week is still a week: seven columns and seven rows, all blank.
       That is what makes "no shared time" readable as an answer. */
    const grid = buildSlotGrid([], 7, GRID_ANCHOR);

    expect(grid.times).toEqual(GRID_TIMES);
    expect(grid.columns).toHaveLength(7);
    expect(grid.columns.every((column) => Object.keys(column.slotsByTime).length === 0)).toBe(
      true,
    );
  });
});

describe('mergeSelectedSlots', () => {
  const offered = [
    slotAt(0, 10),
    slotAt(0, 12),
    slotAt(0, 14),
    slotAt(0, 16),
    slotAt(0, 18),
    slotAt(2, 14),
  ];

  it('merges two blocks that touch into one session', () => {
    const runs = mergeSelectedSlots(offered, [
      slotAt(0, 14).startsAt,
      slotAt(0, 16).startsAt,
    ]);

    expect(runs).toHaveLength(1);
    expect(runs[0].startsAt).toBe(slotAt(0, 14).startsAt);
    expect(runs[0].endsAt).toBe(slotAt(0, 16).endsAt);
    expect(runs[0].slotCount).toBe(2);
  });

  it('keeps blocks on different days apart', () => {
    const runs = mergeSelectedSlots(offered, [
      slotAt(0, 14).startsAt,
      slotAt(2, 14).startsAt,
    ]);

    expect(runs).toHaveLength(2);
  });

  it('breaks a run where there is a gap', () => {
    /*
     * The case that makes exact-timestamp adjacency load-bearing: 12–14 is
     * missing from the selection, so 10–12 and 14–16 are two sessions. A
     * "same day, close enough" rule would book the hour in between, which
     * somebody else may already have.
     */
    const runs = mergeSelectedSlots(offered, [
      slotAt(0, 10).startsAt,
      slotAt(0, 14).startsAt,
    ]);

    expect(runs).toHaveLength(2);
    expect(runs[0].endsAt).toBe(slotAt(0, 10).endsAt);
    expect(runs[1].startsAt).toBe(slotAt(0, 14).startsAt);
  });

  it('keeps a whole free day as one session', () => {
    /*
     * THIS USED TO SPLIT AT EIGHT HOURS, because meetings_bounded refused
     * anything longer and a rejection the student could not act on is worse
     * than two calendar entries. The bound is a day now, so a student who books
     * a full day of revision gets the full day — one session, as selected.
     */
    const runs = mergeSelectedSlots(
      offered,
      [10, 12, 14, 16, 18].map((hour) => slotAt(0, hour).startsAt),
    );

    expect(runs).toHaveLength(1);
    expect(runs[0].slotCount).toBe(5);
    expect(runs[0].startsAt).toBe(slotAt(0, 10).startsAt);
    expect(runs[0].endsAt).toBe(slotAt(0, 18).endsAt);

    /* Ten hours, and still inside what the database will take. */
    const hours =
      (new Date(runs[0].endsAt).getTime() - new Date(runs[0].startsAt).getTime()) / 3_600_000;

    expect(hours).toBe(10);
    expect(hours).toBeLessThanOrEqual(MEETING_MAX_HOURS);
  });

  it('does not care what order the slots were clicked in', () => {
    const forwards = mergeSelectedSlots(offered, [
      slotAt(0, 14).startsAt,
      slotAt(0, 16).startsAt,
    ]);
    const backwards = mergeSelectedSlots(offered, [
      slotAt(0, 16).startsAt,
      slotAt(0, 14).startsAt,
    ]);

    expect(backwards).toEqual(forwards);
  });

  it('ignores a selected key that is no longer on offer', () => {
    /* The slot list is refetched on every open; a stale selection must not
       become a session nobody is free for. */
    const runs = mergeSelectedSlots(offered, [slotAt(5, 14).startsAt]);

    expect(runs).toEqual([]);
  });

  it('returns nothing for an empty selection', () => {
    expect(mergeSelectedSlots(offered, [])).toEqual([]);
  });
});

describe('formatMeetingWhen', () => {
  it('renders a day and a 24-hour range', () => {
    /*
     * 24-hour on purpose: these times came out of the weekly availability grid,
     * where the student picked them from rows labelled "12–14".
     */
    const when = formatMeetingWhen('2026-08-16T12:00:00Z', '2026-08-16T14:00:00Z');

    expect(when).toMatch(/\d{2}:\d{2} – \d{2}:\d{2}/);
    expect(when).not.toMatch(/[AP]M/i);
  });
});

describe('clampSlotsToGridRows', () => {
  /* Local components: the rows are the reader's hours, not UTC's. */
  const slot = (fromHour: number, fromMinute: number, hours: number): MeetingSlotView => {
    const start = campus(16, fromHour, fromMinute);

    return {
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + hours * 3_600_000).toISOString(),
      participantCount: 2,
    };
  };

  const ranges = (slots: MeetingSlotView[]) =>
    slots.map((one) => formatSlotRange(one.startsAt, one.endsAt));

  it('cuts a slot that would straddle the next row', () => {
    /*
     * THE REPORTED BUG. A session booked 14:00–15:00 leaves free time from
     * 15:00, the RPC offers 15:00–17:00, and buildSlotGrid files it under the
     * 14:00 row — so pressing a cell in the row labelled 14:00 offered a booking
     * that ran to 17:00.
     */
    expect(ranges(clampSlotsToGridRows([slot(15, 0, 2)]))).toEqual([
      '15:00 – 16:00',
      '16:00 – 17:00',
    ]);
  });

  it('leaves a slot that already fills its row alone', () => {
    expect(ranges(clampSlotsToGridRows([slot(14, 0, 2)]))).toEqual(['14:00 – 16:00']);
  });

  it('gives every row it touches exactly one fragment', () => {
    /* A whole afternoon offered as three overlapping-by-adjacency chunks comes
       back as one fragment per row, which is what the grid can draw. */
    const offered = [slot(15, 0, 2), slot(17, 0, 2), slot(19, 0, 2)];

    expect(ranges(clampSlotsToGridRows(offered))).toEqual([
      '15:00 – 16:00',
      '16:00 – 18:00',
      '18:00 – 20:00',
      '20:00 – 21:00',
    ]);
  });

  it('handles a start that is not on the hour', () => {
    /* Calendar-derived availability starts wherever the calendar says. */
    expect(ranges(clampSlotsToGridRows([slot(13, 30, 2)]))).toEqual([
      '13:30 – 14:00',
      '14:00 – 15:30',
    ]);
  });

  it('drops a sliver rather than offering it', () => {
    /* Five minutes before the row closes is not a study session. */
    expect(ranges(clampSlotsToGridRows([slot(15, 55, 2)]))).toEqual(['16:00 – 17:55']);
  });

  it('keeps disjoint spans apart, even inside one row', () => {
    /* Free 14:00–14:30, busy until 15:00, free again — two fragments, one row.
       They must not be joined across the booking that separates them. */
    const offered = [slot(14, 0, 0.5), slot(15, 0, 1)];

    expect(ranges(clampSlotsToGridRows(offered))).toEqual([
      '14:00 – 14:30',
      '15:00 – 16:00',
    ]);
  });

  it('has nothing to cut in an empty week', () => {
    expect(clampSlotsToGridRows([])).toEqual([]);
  });
});

describe('buildSlotGrid, when a row holds more than one fragment', () => {
  const slot = (fromHour: number, fromMinute: number, hours: number): MeetingSlotView => {
    const start = campus(16, fromHour, fromMinute);

    return {
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + hours * 3_600_000).toISOString(),
      participantCount: 2,
    };
  };


  it('offers the longer of the two', () => {
    /* The cell draws one slot, and half an hour is a worse offer than a full
       one. The list view still shows both. */
    const grid = buildSlotGrid([slot(14, 0, 0.5), slot(15, 0, 1)], 7, GRID_ANCHOR);
    const cell = grid.columns[0].slotsByTime['14:00'];

    expect(formatSlotRange(cell[0].startsAt, cell[0].endsAt)).toBe('15:00 – 16:00');
  });
});

describe('mergeSelectedSlots, on slots that do not sit on the grid', () => {
  /*
   * THE FIXTURES ABOVE ALL START ON EVEN HOURS, which is why this bug survived
   * every test in this file. A calendar-derived slot starts wherever the
   * student's calendar says — 13:30 is ordinary — and merging used to clamp each
   * end to the two-hour ROW the slot is drawn in, so 13:30–15:30 came back as
   * 13:30–14:00 and contiguous slots stopped being contiguous.
   */
  const offset = (hour: number, minute: number): MeetingSlotView => {
    const start = campus(16, hour, minute);

    return {
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 7_200_000).toISOString(),
      participantCount: 2,
    };
  };

  it('keeps a slot its own full length', () => {
    const slot = offset(13, 30);
    const [run] = mergeSelectedSlots([slot], [slot.startsAt]);

    expect(formatSlotRange(run.startsAt, run.endsAt)).toBe('13:30 – 15:30');
  });

  it('merges an afternoon of them into one session', () => {
    const slots = [offset(13, 30), offset(15, 30), offset(17, 30), offset(19, 30)];
    const runs = mergeSelectedSlots(
      slots,
      slots.map((slot) => slot.startsAt),
    );

    expect(runs).toHaveLength(1);
    expect(formatSlotRange(runs[0].startsAt, runs[0].endsAt)).toBe('13:30 – 21:30');
    expect(runs[0].slotCount).toBe(4);
  });

  it('still splits where the slots are not touching', () => {
    const slots = [offset(13, 30), offset(17, 30)];
    const runs = mergeSelectedSlots(
      slots,
      slots.map((slot) => slot.startsAt),
    );

    expect(runs).toHaveLength(2);
  });
});

describe('mergeSlotsIntoBlocks', () => {
  it('joins back-to-back slots and keeps every one it covered', () => {
    /*
     * The covered starts are the point of the type. The list draws the merged
     * range and selects per slot, so a block that forgot which slots it was made
     * of could only ever select one of them.
     */
    const blocks = mergeSlotsIntoBlocks([slotAt(0, 14), slotAt(0, 16), slotAt(0, 18)]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].slotStarts).toHaveLength(3);
    expect(formatSlotRange(blocks[0].startsAt, blocks[0].endsAt)).toBe('14:00 – 20:00');
  });

  it('BREAKS where a booking has taken the time between', () => {
    /*
     * THE ASSERTION THIS HELPER LIVES OR DIES BY. 14–16 and 18–20 with nothing
     * at 16: that hour is somebody else's session, and a block spanning it would
     * offer a time that cannot be booked. Adjacency is exact equality precisely
     * so this cannot happen.
     */
    const blocks = mergeSlotsIntoBlocks([slotAt(0, 14), slotAt(0, 18)]);

    expect(blocks).toHaveLength(2);
    expect(formatSlotRange(blocks[0].startsAt, blocks[0].endsAt)).toBe('14:00 – 16:00');
    expect(formatSlotRange(blocks[1].startsAt, blocks[1].endsAt)).toBe('18:00 – 20:00');
  });

  it('does not join across a gap of even a minute', () => {
    /* A 45-minute booking leaves a ragged edge rather than a clean hour. The
       rule has to be equality, not "close enough". */
    const first = slotAt(0, 14);
    const later = {
      ...slotAt(0, 16),
      startsAt: new Date(new Date(first.endsAt).getTime() + 60_000).toISOString(),
    };

    expect(mergeSlotsIntoBlocks([first, later])).toHaveLength(2);
  });

  it('keeps different days apart', () => {
    expect(mergeSlotsIntoBlocks([slotAt(0, 14), slotAt(1, 14)])).toHaveLength(2);
  });

  it('sorts before merging, so input order does not matter', () => {
    const forwards = mergeSlotsIntoBlocks([slotAt(0, 14), slotAt(0, 16)]);
    const backwards = mergeSlotsIntoBlocks([slotAt(0, 16), slotAt(0, 14)]);

    expect(backwards).toEqual(forwards);
  });

  it('has nothing to merge in an empty week', () => {
    expect(mergeSlotsIntoBlocks([])).toEqual([]);
  });
});

describe('formatDuration', () => {
  const at = (hour: number, minute = 0) => campus(16, hour, minute).toISOString();

  it('reads whole hours as hours', () => {
    expect(formatDuration(at(14), at(16))).toBe('2h');
  });

  it('reads a part-hour as hours and minutes', () => {
    expect(formatDuration(at(13, 30), at(15))).toBe('1h 30m');
  });

  it('reads under an hour as minutes', () => {
    expect(formatDuration(at(13, 30), at(14))).toBe('30m');
  });

  it('never reads as negative', () => {
    /* A trim that inverted the pair used to be written through unchanged; the
       panel should say 0m rather than something impossible. */
    expect(formatDuration(at(16), at(14))).toBe('0m');
  });
});
