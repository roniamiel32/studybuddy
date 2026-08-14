/**
 * File:        src/features/chat/chat-view.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The shape of a conversation and a message as the UI consumes
 *              them, plus the pure formatting that goes with them.
 *
 *              Kept separate from queries.ts for the same reason match-view.ts
 *              is: that module is `server-only` because it reads cookies, so a
 *              client component importing a type from it drags `next/headers`
 *              into the browser bundle and the build fails. The chat is the most
 *              client-heavy screen in the app, so this split matters more here
 *              than anywhere else.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3)
 */

export interface ChatMessageView {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  /** True for the model-written opener, which the UI labels as generated. */
  isIcebreaker: boolean;
  createdAt: string;
}

export interface ConversationView {
  id: string;
  /** The other student. There are only ever two people in a conversation. */
  partnerId: string;
  partnerName: string;
  partnerAvatarUrl: string | null;
  partnerDegreeName: string | null;
  /** The course that brought them together, for the header. */
  courseCode: string | null;
  courseName: string | null;
  lastMessageAt: string;
  /** Null only in the moment between creating a conversation and its first message. */
  lastMessageBody: string | null;
  lastMessageFromMe: boolean;
  /** Unread messages from the partner. Never counts your own. */
  unreadCount: number;
}

/**
 * Formats a message's time of day.
 *
 * @param timestamp - An ISO timestamp.
 * @returns A short local time, e.g. "10:42".
 */
export function formatMessageTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Formats the receipt line under a sent message.
 *
 * Mirrors the supplied design's "Read 10:42 AM". It says "Sent" rather than
 * inventing a delivery state the database does not track — there is no delivery
 * receipt here, only whether the other person opened the thread.
 *
 * @param message - The message, which must be one the viewer sent.
 * @returns A short status line.
 */
export function formatReceipt(message: ChatMessageView): string {
  if (message.isRead) {
    return message.readAt
      ? `Read ${formatMessageTime(message.readAt)}`
      : 'Read';
  }

  return `Sent ${formatMessageTime(message.createdAt)}`;
}

/**
 * Formats the timestamp on a conversation in the Messages list.
 *
 * Relative for anything recent, then the weekday, then the date. A list of
 * threads is scanned rather than read, and "14:20" is useless on something from
 * last month while "3 Aug" is useless for something from ten minutes ago.
 *
 * @param timestamp - An ISO timestamp.
 * @param now       - Reference time, injectable so the tests are not clock-dependent.
 * @returns A short label.
 */
export function formatConversationTime(timestamp: string, now: Date = new Date()): string {
  const then = new Date(timestamp);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);

  if (minutes < 1) {
    return 'Just now';
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return then.toLocaleDateString(undefined, { weekday: 'short' });
  }

  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Groups anything with a timestamp into runs by calendar day.
 *
 * The design puts a "Today" separator between days. Grouping here rather than
 * in the component keeps the date arithmetic testable and out of the render
 * path.
 *
 * Generic because the chat feed is no longer only messages: a booked session
 * appears in it too, and it has to fall under the same separator as whatever was
 * said around it rather than under one of its own.
 *
 * @param items - Items in ascending order.
 * @param at    - Reads the ISO timestamp off an item.
 * @param now   - Reference time, injectable for the tests.
 * @returns One group per day, each with the label to show above it.
 */
export function groupByDay<T>(
  items: T[],
  at: (item: T) => string,
  now: Date = new Date(),
): Array<{ label: string; items: T[] }> {
  const groups: Array<{ label: string; items: T[] }> = [];
  let currentKey = '';

  for (const item of items) {
    const happened = new Date(at(item));
    const key = happened.toDateString();

    if (key !== currentKey) {
      currentKey = key;
      groups.push({ label: dayLabel(happened, now), items: [] });
    }

    groups[groups.length - 1].items.push(item);
  }

  return groups;
}

/**
 * Groups messages into runs by calendar day.
 *
 * The message-shaped face of groupByDay, kept because the group chat and the
 * unit tests both call it and neither has a reason to care that the direct chat
 * now needs the general form.
 *
 * @param messages - Messages in ascending order.
 * @param now      - Reference time, injectable for the tests.
 * @returns One group per day, each with the label to show above it.
 */
export function groupMessagesByDay(
  messages: ChatMessageView[],
  now: Date = new Date(),
): Array<{ label: string; messages: ChatMessageView[] }> {
  return groupByDay(messages, (message) => message.createdAt, now).map((group) => ({
    label: group.label,
    messages: group.items,
  }));
}

/**
 * Names a day the way a person would.
 *
 * @param day - The day to label.
 * @param now - Reference time.
 * @returns "Today", "Yesterday", a weekday, or a date.
 */
function dayLabel(day: Date, now: Date): string {
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  const daysApart = Math.round((startOfDay(now) - startOfDay(day)) / 86_400_000);

  if (daysApart === 0) {
    return 'Today';
  }

  if (daysApart === 1) {
    return 'Yesterday';
  }

  if (daysApart < 7) {
    return day.toLocaleDateString(undefined, { weekday: 'long' });
  }

  return day.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
  });
}

/**
 * Sums unread messages across conversations.
 *
 * @param conversations - The caller's conversations.
 * @returns The total the navigation badge shows.
 */
export function totalUnread(conversations: ConversationView[]): number {
  return conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);
}

/**
 * Formats an unread count for the badge.
 *
 * Capped, because the badge is a small circle and a four-digit number would
 * either overflow it or shrink the text past legibility.
 *
 * @param count - The unread count.
 * @returns The label, or null when there is nothing to show.
 */
export function formatBadgeCount(count: number): string | null {
  if (count <= 0) {
    return null;
  }

  return count > 99 ? '99+' : String(count);
}
