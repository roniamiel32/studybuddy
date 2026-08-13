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
 *              GROUP THREADS CARRY NO UNREAD COUNT, and the type says so rather
 *              than defaulting it to zero. Group chat has never tracked read
 *              state — there is no per-member last-read column — so a zero here
 *              would be a claim we cannot make. Null renders as no pill at all,
 *              which is honest; inventing a count would put a "0 unread" badge on
 *              a thread full of messages nobody has opened.
 * Version:     0.26.0
 *
 * Modifications:
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
  /** Always null — see the note at the top of this file. */
  unreadCount: null;
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
    subtitle: conversation.courseCode,
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
