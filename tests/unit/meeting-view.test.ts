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
 * Version:     0.29.0
 *
 * Modifications:
 *     0.29.0 - 2026-08-14 - Initial tests (Phase 9G)
 */

import { describe, expect, it } from 'vitest';

import {
  buildChatFeed,
  formatMeetingWhen,
  isBannerMeeting,
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
