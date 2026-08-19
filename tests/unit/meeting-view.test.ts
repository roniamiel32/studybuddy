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
 * Version:     0.48.0
 *
 * Modifications:
 *     0.48.0 - 2026-08-19 - buildSlotGrid now anchors on the week's Sunday and
 *                           draws a fixed set of rows; assertions follow
 *     0.29.0 - 2026-08-14 - Initial tests (Phase 9G)
 */

import { describe, expect, it } from 'vitest';

import {
  MEETING_MAX_HOURS,
  buildChatFeed,
  buildSlotGrid,
  formatMeetingWhen,
  isBannerMeeting,
  mergeSelectedSlots,
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
const GRID_ANCHOR = new Date(2026, 7, 16, 9, 0, 0, 0);

/* The same week, seen from the Wednesday. The grid must snap back to the 16th. */
const MIDWEEK_ANCHOR = new Date(2026, 7, 19, 9, 0, 0, 0);

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
  const start = new Date(
    GRID_ANCHOR.getFullYear(),
    GRID_ANCHOR.getMonth(),
    GRID_ANCHOR.getDate() + daysAhead,
    hour,
  );

  return {
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 7_200_000).toISOString(),
    participantCount: 2,
  };
}

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
