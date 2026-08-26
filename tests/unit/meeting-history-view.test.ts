/**
 * File:        tests/unit/meeting-history-view.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The pure half of Meeting History — the split, the counting, and
 *              the partner phrase — plus the default session title now that it
 *              names a person rather than a course.
 *
 *              THE COUNTING TESTS ARE THE ONES WITH TEETH. summariseMeetingHistory
 *              is what the statistics screen will read, and "attended" has three
 *              ways to be wrong: counting a session that was called off, counting
 *              one the student stepped out of, and counting one that has not
 *              happened yet. Each gets its own case.
 *
 *              hasFinished is set by the fixtures rather than derived from a
 *              clock, exactly as the server sets it — so nothing here changes
 *              answer depending on when the suite runs.
 * Version:     0.47.0
 *
 * Modifications:
 *     0.47.0 - 2026-08-19 - Initial tests
 */

import { describe, expect, it } from 'vitest';

import {
  defaultMeetingTitle,
  formatMeetingPartners,
  isDefaultMeetingTitle,
  meetingChatHref,
  sessionTitleWithPartner,
  splitMeetingHistory,
  summariseMeetingHistory,
  type MeetingHistoryEntry,
  type MeetingPartnerView,
} from '@/features/meetings/meeting-view';

/**
 * Builds a partner, with everything not under test held constant.
 *
 * @param profileId - Who they are.
 * @param fullName  - Their name.
 * @returns A partner view.
 */
function partner(profileId: string, fullName: string): MeetingPartnerView {
  return { profileId, fullName, avatarUrl: null, going: true };
}

/**
 * Builds a history entry, with everything not under test held constant.
 *
 * @param overrides - The fields the test cares about.
 * @returns A history entry.
 */
function entry(overrides: Partial<MeetingHistoryEntry> = {}): MeetingHistoryEntry {
  return {
    id: 'meeting-1',
    title: 'Study session with Dana Levi',
    location: null,
    startsAt: '2026-08-14T09:00:00Z',
    endsAt: '2026-08-14T11:00:00Z',
    scope: 'direct',
    conversationId: 'conversation-1',
    groupId: null,
    partners: [partner('dana', 'Dana Levi')],
    going: true,
    isOrganiser: true,
    cancelled: false,
    hasFinished: true,
    createdAt: '2026-08-13T09:00:00Z',
    ...overrides,
  };
}

describe('defaultMeetingTitle', () => {
  it('is nameless, whatever the session is with', () => {
    /*
     * The form already sits inside the chat with the person, so the name is
     * noise there — and this is also the string stored on the row, which BOTH
     * people read. Only one of them is Dana Levi.
     */
    expect(defaultMeetingTitle()).toBe('Study session');
  });

  it('satisfies the schema on its own', () => {
    /* createMeetingSchema wants at least three characters. */
    expect(defaultMeetingTitle().length).toBeGreaterThanOrEqual(3);
  });
});

describe('sessionTitleWithPartner', () => {
  it('names the reader’s partner, for their calendar', () => {
    expect(sessionTitleWithPartner('Dana Levi')).toBe('Study session with Dana Levi');
  });

  it('trims, so a stray space cannot produce a double one', () => {
    expect(sessionTitleWithPartner(' Omer Katz ')).toBe('Study session with Omer Katz');
  });

  it('falls back to the bare title when the name is empty', () => {
    expect(sessionTitleWithPartner('   ')).toBe('Study session');
  });
});

describe('isDefaultMeetingTitle', () => {
  it('recognises both titles this app generates', () => {
    /* Both, because rows written before the form stopped naming the partner
       still carry the longer form and must stay rewritable. */
    expect(isDefaultMeetingTitle(defaultMeetingTitle())).toBe(true);
    expect(isDefaultMeetingTitle(sessionTitleWithPartner('Dana Levi'))).toBe(true);
  });

  it('leaves a title a student typed alone', () => {
    /* The whole point: the calendar sync rewrites only its own defaults, so
       "Past papers" reaches Google exactly as the organiser wrote it. */
    expect(isDefaultMeetingTitle('Past papers')).toBe(false);
    expect(isDefaultMeetingTitle('Revision with the study session crowd')).toBe(false);
  });
});

describe('meetingChatHref', () => {
  it('sends a one-to-one session to its conversation', () => {
    expect(meetingChatHref(entry())).toBe('/messages/conversation-1');
  });

  it('sends a group session to its group', () => {
    expect(
      meetingChatHref(entry({ scope: 'group', conversationId: null, groupId: 'group-9' })),
    ).toBe('/groups/group-9');
  });

  it('has nowhere to send a session whose chat is gone', () => {
    /* The row still renders — the session happened — but as plain text rather
       than a control that goes nowhere. */
    expect(meetingChatHref(entry({ conversationId: null, groupId: null }))).toBeNull();
  });
});

describe('splitMeetingHistory', () => {
  it('reads upcoming forwards and past backwards', () => {
    const entries = [
      entry({ id: 'old', hasFinished: true }),
      entry({ id: 'recent', hasFinished: true }),
      entry({ id: 'soon', hasFinished: false }),
      entry({ id: 'later', hasFinished: false }),
    ];

    const { upcoming, past } = splitMeetingHistory(entries);

    expect(upcoming.map((item) => item.id)).toEqual(['soon', 'later']);
    /* Reversed: a history is read most-recent first. */
    expect(past.map((item) => item.id)).toEqual(['recent', 'old']);
  });

  it('does not mutate the list it was given', () => {
    const entries = [entry({ id: 'a' }), entry({ id: 'b' })];

    splitMeetingHistory(entries);

    expect(entries.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('handles an empty history', () => {
    expect(splitMeetingHistory([])).toEqual({ upcoming: [], past: [] });
  });
});

describe('summariseMeetingHistory', () => {
  it('counts a finished session the student stayed in', () => {
    const summary = summariseMeetingHistory([entry()]);

    expect(summary.attended).toBe(1);
    expect(summary.hoursStudied).toBe(2);
    expect(summary.distinctPartners).toBe(1);
  });

  it('does not count a session that was called off', () => {
    const summary = summariseMeetingHistory([entry({ cancelled: true })]);

    expect(summary.total).toBe(1);
    expect(summary.attended).toBe(0);
    expect(summary.hoursStudied).toBe(0);
  });

  it('does not count a session the student stepped out of', () => {
    const summary = summariseMeetingHistory([entry({ going: false })]);

    expect(summary.attended).toBe(0);
    expect(summary.hoursStudied).toBe(0);
  });

  it('does not count a session that has not happened yet', () => {
    const summary = summariseMeetingHistory([entry({ hasFinished: false })]);

    expect(summary.upcoming).toBe(1);
    expect(summary.attended).toBe(0);
  });

  it('counts a person once however many times they were studied with', () => {
    const dana = partner('dana', 'Dana Levi');
    const omer = partner('omer', 'Omer Katz');

    const summary = summariseMeetingHistory([
      entry({ id: '1', partners: [dana] }),
      entry({ id: '2', partners: [dana] }),
      entry({ id: '3', partners: [dana, omer], scope: 'group' }),
    ]);

    expect(summary.distinctPartners).toBe(2);
    expect(summary.attended).toBe(3);
    expect(summary.hoursStudied).toBe(6);
  });

  it('reports hours to one decimal place', () => {
    const summary = summariseMeetingHistory([
      entry({ startsAt: '2026-08-14T09:00:00Z', endsAt: '2026-08-14T10:30:00Z' }),
    ]);

    expect(summary.hoursStudied).toBe(1.5);
  });
});

describe('formatMeetingPartners', () => {
  it('names one', () => {
    expect(formatMeetingPartners([partner('a', 'Dana Levi')])).toBe('Dana Levi');
  });

  it('joins two with "and"', () => {
    expect(formatMeetingPartners([partner('a', 'Dana Levi'), partner('b', 'Omer Katz')])).toBe(
      'Dana Levi and Omer Katz',
    );
  });

  it('summarises a crowd rather than growing the row', () => {
    const people = [
      partner('a', 'Dana Levi'),
      partner('b', 'Omer Katz'),
      partner('c', 'Noa Shani'),
      partner('d', 'Yuval Bar'),
    ];

    expect(formatMeetingPartners(people)).toBe('Dana Levi, Omer Katz and 2 others');
  });

  it('says "other" in the singular', () => {
    const people = [
      partner('a', 'Dana Levi'),
      partner('b', 'Omer Katz'),
      partner('c', 'Noa Shani'),
    ];

    expect(formatMeetingPartners(people)).toBe('Dana Levi, Omer Katz and 1 other');
  });

  it('has something to say about a session nobody else is left on', () => {
    expect(formatMeetingPartners([])).toBe('No one else');
  });
});
