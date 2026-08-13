/**
 * File:        src/app/(app)/messages/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Messages tab — every conversation the student is in, personal
 *              and group alike.
 *
 *              GROUP CHATS LIVE HERE SINCE PHASE 9D. They were on a tab of their
 *              own, which meant a student looking for "the last thing anyone said
 *              to me" had two places to look and no way to tell which was more
 *              recent. Merging them is what makes "newest first" a true answer.
 *
 *              A GROUP ROW OPENS THE GROUP PAGE, not a stripped-down chat: the
 *              members sidebar, the study sessions and the message board are the
 *              group chat, and Messages is a way in rather than a replacement.
 * Version:     0.13.0
 *
 * Modifications:
 *     0.26.0 - 2026-08-13 - Group chats, sorting, filtering, paging (Phase 9D)
 *     0.13.0 - 2026-08-10 - Renamed from Requests
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3)
 */

import type { Metadata } from 'next';

import { ConversationsRefresh } from '@/components/chat/conversations-refresh';
import { ThreadList } from '@/components/chat/thread-list';
import { totalUnread } from '@/features/chat/chat-view';
import { getConversations } from '@/features/chat/queries';
import { getGroupThreads } from '@/features/chat/group-threads';
import { personThread } from '@/features/chat/thread-view';

export const metadata: Metadata = { title: 'Messages' };

/**
 * Renders the conversation list.
 *
 * @returns The page element.
 */
export default async function MessagesPage() {
  const [conversations, groupThreads] = await Promise.all([
    getConversations(),
    getGroupThreads(),
  ]);

  const unread = totalUnread(conversations);

  /* Merged unsorted: ThreadList owns the ordering, because it is also what the
     sort control changes. */
  const threads = [...conversations.map(personThread), ...groupThreads];

  return (
    <>
      <ConversationsRefresh />

      <div className="mb-8">
        <h1 className="font-heading text-[28px] leading-9 text-balance sm:text-headline-lg">
          Messages
        </h1>
        <p className="text-on-surface-variant mt-2 text-body-md text-pretty">
          {threads.length === 0
            ? 'Conversations you start with your matches will appear here, and so will the study groups you join.'
            : unread > 0
              ? `You have ${unread} unread ${unread === 1 ? 'message' : 'messages'}.`
              : 'Your conversations and group chats.'}
        </p>
      </div>

      <ThreadList threads={threads} />
    </>
  );
}
