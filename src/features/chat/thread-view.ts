/**
 * File:        src/features/chat/thread-view.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: One shape for the two kinds of conversation the Messages tab now
 *              holds.
 *
 *              A DISCRIMINATED UNION ON `kind`, not two lists rendered next to
 *              each other. Sorting by "most recent" across both is the whole
 *              point of merging them, and that is only possible once they are one
 *              array of one type. The union means the renderer has to say which
 *              case it is handling and the compiler notices when a third kind
 *              arrives.
 *
 *              BOTH KINDS NOW CARRY A REAL UNREAD COUNT. Until Phase 9E a group
 *              thread's was typed `null`, because group chat tracked no read
 *              state and a zero would have been a claim we could not make.
 *              `study_group_members.last_seen_at` is that state, so the number is
 *              now honest for both — and the union no longer needs the renderer
 *              to special-case which kind it is holding before showing a badge.
 * Version:     0.48.0
 *
 * Modifications:
 *     0.48.0 - 2026-08-19 - The thread subtitle is the course name
 *     0.27.0 - 2026-08-13 - Group threads count unread against last_seen_at
 *                           (Phase 9E)
 *     0.26.0 - 2026-08-13 - Initial implementation (Phase 9D)
 */

import type { ConversationView } from './chat-view';

export interface PersonThreadView {
  kind: 'person';
  id: string;
  /** Where clicking the row goes. */
  href: string;
  title: string;
  avatarUrl: string | null;
  /** The line under the title — the course they matched in. */
  subtitle: string | null;
  lastMessageAt: string;
  lastMessageBody: string | null;
  lastMessageFromMe: boolean;
  unreadCount: number;
}

export interface GroupThreadView {
  kind: 'group';
  id: string;
  href: string;
  title: string;
  avatarUrl: null;
  subtitle: string | null;
  lastMessageAt: string;
  lastMessageBody: string | null;
  lastMessageFromMe: boolean;
  /**
   * Messages from other people since this member last opened the chat. System
   * lines are not counted — a badge that lights up because somebody joined sends
   * you to a chat where nothing was said.
   */
  unreadCount: number;
  memberCount: number;
}

export type MessageThreadView = PersonThreadView | GroupThreadView;

export type ThreadSort = 'newest' | 'oldest';
export type ThreadFilter = 'all' | 'groups' | 'people';

/**
 * Turns a personal conversation into a thread row.
 *
 * @param conversation - The conversation.
 * @returns The thread.
 */
export function personThread(conversation: ConversationView): PersonThreadView {
  return {
    kind: 'person',
    id: conversation.id,
    href: `/messages/${conversation.id}`,
    title: conversation.partnerName,
    avatarUrl: conversation.partnerAvatarUrl,
    subtitle: conversation.courseName,
    lastMessageAt: conversation.lastMessageAt,
    lastMessageBody: conversation.lastMessageBody,
    lastMessageFromMe: conversation.lastMessageFromMe,
    unreadCount: conversation.unreadCount,
  };
}

/**
 * Orders and narrows the merged list.
 *
 * PURE, so the ordering can be tested without a database — and so the control
 * bar can re-run it on every keystroke without a round trip.
 *
 * @param threads - Every thread, in any order.
 * @param sort    - Newest or oldest first.
 * @param filter  - Which kinds to keep.
 * @returns A new array.
 */
export function arrangeThreads(
  threads: MessageThreadView[],
  sort: ThreadSort,
  filter: ThreadFilter,
): MessageThreadView[] {
  const kept = threads.filter((thread) => {
    if (filter === 'groups') {
      return thread.kind === 'group';
    }

    if (filter === 'people') {
      return thread.kind === 'person';
    }

    return true;
  });

  /*
   * Compared as strings. Both sides are ISO-8601 UTC out of Postgres, which
   * sorts identically lexicographically and numerically — and does it without
   * building two Date objects per comparison.
   */
  return [...kept].sort((a, b) =>
    sort === 'newest'
      ? b.lastMessageAt.localeCompare(a.lastMessageAt)
      : a.lastMessageAt.localeCompare(b.lastMessageAt),
  );
}
