/**
 * File:        src/components/matching/message-button.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Send message" on a match card.
 *
 *              Calls /api/icebreaker, which opens the conversation, writes the
 *              first message and returns where to go — then navigates there. One
 *              button, one outcome: the student ends up in a thread that already
 *              has an opener in it.
 *
 *              The label is deliberately plain. The previous copy promised a
 *              "smart icebreaker", and the button now sometimes sends a
 *              hand-built opener instead — when no model is configured, or when
 *              one fails. "Send message" is true in every case, which the old
 *              label was not.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3)
 */

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageCircle } from 'lucide-react';

import type { IcebreakerResponse } from '@/app/api/icebreaker/route';
import { cn } from '@/lib/utils';

export interface MessageButtonProps {
  /** The classmate to write to. */
  partnerId: string;
  /** Recorded on the conversation, so the chat header can name the course. */
  courseOfferingId: string | null;
  /** Their name, for the accessible label — several of these share a screen. */
  partnerName: string;
  /** 'primary' on the top match, 'secondary' in the grid. */
  tone?: 'primary' | 'secondary';
  className?: string;
}

/**
 * Renders the button that starts a conversation.
 *
 * @param partnerId        - The classmate to message.
 * @param courseOfferingId - The course they matched on, or null.
 * @param partnerName      - Used in the accessible label.
 * @param tone             - Which button treatment to use.
 * @param className        - Extra classes from the caller's layout.
 * @returns The button element.
 */
export function MessageButton({
  partnerId,
  courseOfferingId,
  partnerName,
  tone = 'secondary',
  className,
}: MessageButtonProps) {
  const router = useRouter();
  const [isNavigating, startNavigating] = useTransition();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = sending || isNavigating;

  const start = async () => {
    setSending(true);
    setError(null);

    try {
      const response = await fetch('/api/icebreaker', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ partnerId, courseOfferingId: courseOfferingId ?? undefined }),
      });

      const payload = (await response.json()) as IcebreakerResponse;

      if (payload.conversationId) {
        /*
         * Navigate even when origin is 'unavailable'. That case means the
         * conversation exists but its first message did not send, and the chat
         * room — where they can type their own — is the most useful place to be.
         */
        startNavigating(() => {
          router.push(`/messages/${payload.conversationId}`);
        });
        return;
      }

      setError(payload.error ?? 'We could not start that conversation.');
    } catch {
      setError('We could not reach the server. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        aria-label={`Send message to ${partnerName}`}
        className={cn(
          tone === 'primary'
            ? 'clay-btn-primary rounded-full px-6 py-3 text-label-md'
            : 'inline-flex h-10 items-center justify-center gap-2 rounded-md border-2 border-brand bg-white px-4 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
      >
        {busy ? (
          <Loader2 className={cn('animate-spin', tone === 'primary' ? 'size-5' : 'size-4')} aria-hidden="true" />
        ) : (
          <MessageCircle
            className={tone === 'primary' ? 'size-5' : 'size-4'}
            aria-hidden="true"
          />
        )}
        {busy ? 'Starting…' : 'Send message'}
      </button>

      {error ? (
        <p role="alert" className="text-destructive mt-2 text-label-sm font-normal">
          {error}
        </p>
      ) : null}
    </>
  );
}
