/**
 * File:        src/app/(app)/messages/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Messages tab — the student's conversations.
 * Version:     0.13.0
 *
 * Modifications:
 *     0.13.0 - 2026-08-10 - Renamed from Requests
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3)
 */

import type { Metadata } from 'next';

import { ConversationList } from '@/components/chat/conversation-list';
import { ConversationsRefresh } from '@/components/chat/conversations-refresh';
import { totalUnread } from '@/features/chat/chat-view';
import { getConversations } from '@/features/chat/queries';

export const metadata: Metadata = { title: 'Messages' };

/**
 * Renders the conversation list.
 *
 * @returns The page element.
 */
export default async function MessagesPage() {
  const conversations = await getConversations();
  const unread = totalUnread(conversations);

  return (
    <>
      <ConversationsRefresh />

      <div className="mb-8">
        <h1 className="font-heading text-[28px] leading-9 text-balance sm:text-headline-lg">
          Messages
        </h1>
        <p className="text-on-surface-variant mt-2 text-body-md text-pretty">
          {conversations.length === 0
            ? 'Conversations you start with your matches will appear here.'
            : unread > 0
              ? `You have ${unread} unread ${unread === 1 ? 'message' : 'messages'}.`
              : 'Your conversations, most recent first.'}
        </p>
      </div>

      <ConversationList conversations={conversations} />
    </>
  );
}
