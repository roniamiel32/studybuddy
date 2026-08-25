/**
 * File:        src/components/chat/message-bubble.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: One message. Sent messages are brand-filled and right-aligned
 *              with a receipt line; received ones are white, left-aligned, and
 *              carry the sender's avatar — straight from the supplied design.
 *
 *              The design's asymmetric corner (rounded-br-sm on a sent bubble,
 *              rounded-bl-sm on a received one) is what makes the direction
 *              readable without reading the text, so it is kept exactly.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3)
 */

import { Sparkles } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { formatReceipt, type ChatMessageView } from '@/features/chat/chat-view';
import { cn } from '@/lib/utils';

export interface MessageBubbleProps {
  message: ChatMessageView;
  /** True when the viewer wrote it. */
  fromMe: boolean;
  partnerName: string;
  partnerAvatarUrl: string | null;
  /** Avatars only appear on the last message of a run, as in the design. */
  showAvatar: boolean;
}

/**
 * Renders one message bubble.
 *
 * @param message           - The message.
 * @param fromMe            - Whether the viewer sent it.
 * @param partnerName       - Used for the avatar fallback initial.
 * @param partnerAvatarUrl  - The other student's photo, or null.
 * @param showAvatar        - Whether to draw the avatar beside it.
 * @returns The list item element.
 */
export function MessageBubble({
  message,
  fromMe,
  partnerName,
  partnerAvatarUrl,
  showAvatar,
}: MessageBubbleProps) {
  if (fromMe) {
    return (
      <li className="flex max-w-[85%] flex-col gap-1 self-end">
        <div className="bg-brand text-white shadow-clay-soft relative overflow-hidden rounded-2xl rounded-br-sm p-3">
          {/* The design's inner top highlight, which gives the bubble its depth. */}
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-white/25" />
          <p className="text-[15px] whitespace-pre-wrap">{message.body}</p>
        </div>
        <span className="text-outline self-end pr-1 text-[10px]">{formatReceipt(message)}</span>
      </li>
    );
  }

  return (
    <li className="flex max-w-[85%] flex-col gap-1">
      <div className="flex items-end gap-2">
        {showAvatar ? (
          <MatchAvatar
            fullName={partnerName}
            avatarUrl={partnerAvatarUrl}
            size={32}
            className="mt-auto border-2 shadow-sm"
          />
        ) : (
          /* Keeps the bubbles in a run aligned with the one that has the avatar. */
          <span aria-hidden="true" className="size-8 shrink-0" />
        )}

        <div className="border-outline-variant/20 rounded-2xl rounded-bl-sm border bg-white p-3 shadow-sm">
          {message.isIcebreaker ? (
            /*
             * Stated, not styled away. The recipient is told this opener was
             * drafted by a model rather than typed by the person whose name is on
             * it — the same honesty rule the course catalog follows for generated
             * course lists.
             */
            <p className="text-grape mb-1.5 flex items-center gap-1.5 text-label-sm tracking-wider uppercase">
              <Sparkles className="size-3.5" aria-hidden="true" />
              AI icebreaker
            </p>
          ) : null}
          <p className={cn('text-on-surface text-[15px] whitespace-pre-wrap')}>{message.body}</p>
        </div>
      </div>
    </li>
  );
}
