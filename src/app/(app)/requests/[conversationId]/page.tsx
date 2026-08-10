/**
 * File:        src/app/(app)/requests/[conversationId]/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: One conversation.
 *
 *              A conversation that is not the caller's returns no row under RLS,
 *              and this renders a 404 rather than a "forbidden". Distinguishing
 *              the two would confirm that a given conversation id exists, which
 *              is more than a stranger should be able to learn by guessing.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3)
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ChatRoom } from '@/components/chat/chat-room';
import { getConversation, getMessages } from '@/features/chat/queries';
import { requireUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Conversation' };

/**
 * Renders the chat room.
 *
 * @param params - Route parameters carrying the conversation id.
 * @returns The page element.
 */
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  const [user, conversation] = await Promise.all([requireUser(), getConversation(conversationId)]);

  if (!conversation) {
    notFound();
  }

  const messages = await getMessages(conversationId);

  return (
    <ChatRoom conversation={conversation} initialMessages={messages} viewerId={user.id} />
  );
}
