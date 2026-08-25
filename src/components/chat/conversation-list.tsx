/**
 * File:        src/components/chat/conversation-list.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Messages tab — every active conversation, most recent first.
 *
 *              A server component: the list is a read, and nothing here is
 *              interactive beyond following a link. Liveness comes from
 *              ConversationsRefresh, which re-renders this on the server when a
 *              message arrives, so the previews and the unread pills stay right
 *              without this component holding client state.
 * Version:     0.48.0
 *
 * Modifications:
 *     0.48.0 - 2026-08-19 - The chip shows the course name
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3)
 */

import Link from 'next/link';
import { ChevronRight, MessagesSquare } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { Chip } from '@/components/ui/chip';
import { formatConversationTime, type ConversationView } from '@/features/chat/chat-view';
import { cn } from '@/lib/utils';

export interface ConversationListProps {
  conversations: ConversationView[];
}

/**
 * Renders the conversation list.
 *
 * @param conversations - The caller's conversations, newest first.
 * @returns The list element.
 */
export function ConversationList({ conversations }: ConversationListProps) {
  if (conversations.length === 0) {
    return <EmptyConversations />;
  }

  return (
    /* Named, so a test — or a screen-reader user — can tell this list of people
       apart from the match cards, which now also link names to profiles. */
    <ul aria-label="Conversations" className="flex flex-col gap-3">
      {conversations.map((conversation) => {
        const unread = conversation.unreadCount > 0;

        return (
          <li key={conversation.id}>
            <Link
              href={`/messages/${conversation.id}`}
              className={cn(
                'clay-card focus-visible:ring-brand/35 flex items-center gap-4 p-4 transition-colors focus-visible:ring-4 focus-visible:outline-none',
                /* An unread thread is tinted, not just badged: the whole row is
                   the target, so the whole row should read as "new". */
                unread && 'bg-brand-fixed/30',
              )}
            >
              <MatchAvatar
                fullName={conversation.partnerName}
                avatarUrl={conversation.partnerAvatarUrl}
                size={48}
                className="border-[3px]"
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <h2
                    className={cn(
                      'truncate text-label-md text-[15px]',
                      unread && 'font-bold',
                    )}
                  >
                    {conversation.partnerName}
                  </h2>
                  <span className="text-outline shrink-0 text-label-sm font-normal">
                    {formatConversationTime(conversation.lastMessageAt)}
                  </span>
                </div>

                <p
                  className={cn(
                    'truncate text-label-sm font-normal',
                    unread ? 'text-on-surface' : 'text-on-surface-variant',
                  )}
                >
                  {conversation.lastMessageBody
                    ? /* "You: " so a student can see who spoke last without
                         opening the thread. */
                      `${conversation.lastMessageFromMe ? 'You: ' : ''}${conversation.lastMessageBody}`
                    : 'No messages yet'}
                </p>

                <div className="mt-1.5 flex items-center gap-2">
                  {unread ? (
                    <Chip tone="sunset">
                      {conversation.unreadCount} new
                    </Chip>
                  ) : null}
                </div>
              </div>

              <ChevronRight
                className="text-outline size-5 shrink-0"
                aria-hidden="true"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Explains an empty Messages tab, and where conversations come from.
 *
 * @returns The empty state element.
 */
function EmptyConversations() {
  return (
    <div className="clay-card flex flex-col items-center p-8 text-center sm:p-12">
      <span className="bg-brand-fixed text-brand mb-4 flex size-14 items-center justify-center rounded-full">
        <MessagesSquare className="size-7" aria-hidden="true" />
      </span>

      <h2 className="font-heading text-headline-md">No conversations yet</h2>
      <p className="text-on-surface-variant mt-2 max-w-md text-body-md text-pretty">
        Open one from your matches — we will write the first message for you, and
        you can take it from there.
      </p>

      <Link href="/dashboard" className="clay-btn-primary mt-6 rounded-full px-6 py-3 text-label-md">
        See your matches
      </Link>
    </div>
  );
}
