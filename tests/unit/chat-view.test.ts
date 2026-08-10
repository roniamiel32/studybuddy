/**
 * File:        tests/unit/chat-view.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Unit tests for the chat's pure formatting — receipts, day
 *              grouping, relative times and the badge count.
 *
 *              All of it is clock-dependent, which is exactly why it lives in
 *              pure functions with an injectable "now" rather than inline in a
 *              component: a test that has to wait for midnight to fail is not a
 *              test.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Initial tests (Phase 3)
 */

import { describe, expect, it } from 'vitest';

import {
  formatBadgeCount,
  formatConversationTime,
  formatReceipt,
  groupMessagesByDay,
  totalUnread,
  type ChatMessageView,
  type ConversationView,
} from '@/features/chat/chat-view';

/** A message with sensible defaults, overridable per test. */
function message(overrides: Partial<ChatMessageView> = {}): ChatMessageView {
  return {
    id: 'm1',
    conversationId: 'c1',
    senderId: 's1',
    body: 'Hello',
    isRead: false,
    readAt: null,
    isIcebreaker: false,
    createdAt: '2026-08-10T07:42:00.000Z',
    ...overrides,
  };
}

describe('formatBadgeCount', () => {
  it('hides the badge entirely at zero', () => {
    /* The requirement is a hidden badge, not a circle containing 0. */
    expect(formatBadgeCount(0)).toBeNull();
  });

  it('never shows a negative count', () => {
    expect(formatBadgeCount(-3)).toBeNull();
  });

  it('shows the number when there is something unread', () => {
    expect(formatBadgeCount(1)).toBe('1');
    expect(formatBadgeCount(42)).toBe('42');
  });

  it('caps at 99+, because the badge is a small circle', () => {
    expect(formatBadgeCount(99)).toBe('99');
    expect(formatBadgeCount(100)).toBe('99+');
    expect(formatBadgeCount(4821)).toBe('99+');
  });
});

describe('formatReceipt', () => {
  it('says Read with the time the other person opened it', () => {
    const receipt = formatReceipt(
      message({ isRead: true, readAt: '2026-08-10T07:45:00.000Z' }),
    );

    expect(receipt).toMatch(/^Read /);
  });

  it('says Read without a time when the stamp is missing', () => {
    /* Should not happen — the trigger sets read_at — but a receipt reading
       "Read Invalid Date" would be worse than a plain "Read". */
    expect(formatReceipt(message({ isRead: true, readAt: null }))).toBe('Read');
  });

  it('says Sent, not Delivered, while unread', () => {
    /* There is no delivery receipt in this schema, only whether the thread was
       opened. Claiming delivery would be inventing a state. */
    expect(formatReceipt(message({ isRead: false }))).toMatch(/^Sent /);
  });
});

describe('formatConversationTime', () => {
  const now = new Date('2026-08-10T12:00:00.000Z');

  it('says Just now under a minute', () => {
    expect(formatConversationTime('2026-08-10T11:59:30.000Z', now)).toBe('Just now');
  });

  it('counts minutes, then hours', () => {
    expect(formatConversationTime('2026-08-10T11:20:00.000Z', now)).toBe('40m ago');
    expect(formatConversationTime('2026-08-10T07:00:00.000Z', now)).toBe('5h ago');
  });

  it('names the weekday within the week', () => {
    /* Three days back: a weekday is more use than "72h ago". */
    const label = formatConversationTime('2026-08-07T12:00:00.000Z', now);

    expect(label).not.toMatch(/ago/);
    expect(label.length).toBeGreaterThan(2);
  });

  it('falls back to a date beyond a week', () => {
    const label = formatConversationTime('2026-07-02T12:00:00.000Z', now);

    expect(label).not.toMatch(/ago/);
    expect(label).toMatch(/\d/);
  });
});

describe('groupMessagesByDay', () => {
  const now = new Date('2026-08-10T12:00:00.000Z');

  it('returns nothing for an empty thread', () => {
    expect(groupMessagesByDay([], now)).toEqual([]);
  });

  it('keeps one group for messages on the same day', () => {
    const groups = groupMessagesByDay(
      [
        message({ id: 'a', createdAt: '2026-08-10T08:00:00.000Z' }),
        message({ id: 'b', createdAt: '2026-08-10T09:00:00.000Z' }),
        message({ id: 'c', createdAt: '2026-08-10T10:00:00.000Z' }),
      ],
      now,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].messages).toHaveLength(3);
  });

  it('splits across days and labels them in words', () => {
    const groups = groupMessagesByDay(
      [
        message({ id: 'a', createdAt: '2026-08-09T20:00:00.000Z' }),
        message({ id: 'b', createdAt: '2026-08-10T09:00:00.000Z' }),
      ],
      now,
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('Yesterday');
    expect(groups[1].label).toBe('Today');
  });

  it('preserves order within a group', () => {
    const groups = groupMessagesByDay(
      [
        message({ id: 'first', createdAt: '2026-08-10T08:00:00.000Z' }),
        message({ id: 'second', createdAt: '2026-08-10T09:00:00.000Z' }),
      ],
      now,
    );

    expect(groups[0].messages.map((m) => m.id)).toEqual(['first', 'second']);
  });
});

describe('totalUnread', () => {
  /** A conversation with only the field this function reads. */
  const conversation = (unreadCount: number): ConversationView => ({
    id: `c${unreadCount}`,
    partnerId: 'p',
    partnerName: 'Partner',
    partnerAvatarUrl: null,
    partnerDegreeName: null,
    courseCode: null,
    courseName: null,
    lastMessageAt: '2026-08-10T07:42:00.000Z',
    lastMessageBody: null,
    lastMessageFromMe: false,
    unreadCount,
  });

  it('is zero with no conversations', () => {
    expect(totalUnread([])).toBe(0);
  });

  it('sums across conversations', () => {
    expect(totalUnread([conversation(2), conversation(0), conversation(5)])).toBe(7);
  });
});
