/**
 * File:        src/components/chat/chat-room.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The chat room: header, message canvas, and composer, following
 *              the supplied design.
 *
 *              REALTIME IS THE POINT OF THIS COMPONENT. It seeds from a server
 *              render so the first paint is complete, then subscribes to
 *              postgres_changes on this conversation. Both sides see a new
 *              message without a refresh, and a receipt line updates when the
 *              other person opens the thread.
 *
 *              STATE IS DELIBERATELY NOT A COPY OF THE MESSAGES. Only rows that
 *              arrived over the socket are held here; the history stays in the
 *              server-rendered prop, and the two are merged by id during render.
 *              That is what removes the usual bug in this shape of component —
 *              seeding state from props and then having to re-sync it whenever the
 *              server sends a fresher list, which no amount of effects gets
 *              reliably right. Here a re-render simply wins, and a row present in
 *              both is taken from the socket, which is never older.
 * Version:     0.18.0
 *
 * Modifications:
 *     0.18.0 - 2026-08-10 - The partner's name links to their profile (Phase 6)
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3)
 */

'use client';

import { useActionState, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Loader2, Send } from 'lucide-react';

import { MessageBubble } from '@/components/chat/message-bubble';
import { MatchAvatar } from '@/components/matching/match-avatar';
import {
  groupMessagesByDay,
  type ChatMessageView,
  type ConversationView,
} from '@/features/chat/chat-view';
import { markConversationRead, sendMessage } from '@/features/chat/actions';
import { MAX_MESSAGE_LENGTH } from '@/features/chat/schema';
import { createClient } from '@/lib/supabase/client';

export interface ChatRoomProps {
  conversation: ConversationView;
  initialMessages: ChatMessageView[];
  viewerId: string;
}

/** Shapes a database row into the view model. One place, two callers. */
function toMessageView(row: Record<string, unknown>): ChatMessageView {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: String(row.sender_id),
    body: String(row.body),
    isRead: Boolean(row.is_read),
    readAt: (row.read_at as string | null) ?? null,
    isIcebreaker: Boolean(row.is_icebreaker),
    createdAt: String(row.created_at),
  };
}

/**
 * Combines the server-rendered history with rows that arrived over the socket.
 *
 * A message present in both is taken from the socket copy, which is never the
 * older of the two: a row only arrives there when it is inserted or updated.
 *
 * @param history - Server-rendered messages.
 * @param live    - Rows received over Realtime.
 * @returns Every message, oldest first, each appearing once.
 */
function mergeMessages(
  history: ChatMessageView[],
  live: ChatMessageView[],
): ChatMessageView[] {
  const byId = new Map(history.map((message) => [message.id, message]));

  for (const message of live) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Renders a conversation.
 *
 * @param conversation    - Who and what this thread is about.
 * @param initialMessages - Server-rendered history.
 * @param viewerId        - The signed-in student.
 * @returns The chat room element.
 */
export function ChatRoom({ conversation, initialMessages, viewerId }: ChatRoomProps) {
  const router = useRouter();
  /* Unique per instance: one channel per name on a memoised client. */
  const channelId = useId();
  /* Socket arrivals only. The history lives in initialMessages. */
  const [live, setLive] = useState<ChatMessageView[]>([]);
  const [state, formAction, pending] = useActionState(sendMessage, null);
  const [draft, setDraft] = useState('');
  /* Identity of the result already handled, so one success clears once. */
  const [clearedFor, setClearedFor] = useState<typeof state>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const error = state && !state.ok ? state.error : null;

  const messages = useMemo(
    () => mergeMessages(initialMessages, live),
    [initialMessages, live],
  );

  /* ---- Realtime ---------------------------------------------------------- */
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`conversation-${conversation.id}-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          /* Server-side filter: this socket carries one conversation only. */
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const incoming = toMessageView(payload.new as Record<string, unknown>);

          /* Merge by id, so a row also present in the server render is not
             appended a second time. */
          setLive((current) => [
            ...current.filter((message) => message.id !== incoming.id),
            incoming,
          ]);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          /* Almost always is_read flipping, which moves a receipt to "Read". */
          const updated = toMessageView(payload.new as Record<string, unknown>);

          setLive((current) => [
            ...current.filter((message) => message.id !== updated.id),
            updated,
          ]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelId, conversation.id]);

  /* ---- Mark as read ------------------------------------------------------ */
  useEffect(() => {
    /*
     * Opening the conversation is the read receipt, as specified. Fires once per
     * mount rather than per message: the action updates every unread row from the
     * other side in one statement, and re-running it on each arrival would be a
     * write per message received while the thread is open.
     */
    void markConversationRead(conversation.id);
  }, [conversation.id]);

  /* Also mark read when a message arrives while the thread is already open. */
  const unreadFromPartner = messages.filter(
    (message) => message.senderId !== viewerId && !message.isRead,
  ).length;

  useEffect(() => {
    if (unreadFromPartner > 0) {
      void markConversationRead(conversation.id);
    }
  }, [conversation.id, unreadFromPartner]);

  /* ---- Keep the newest message in view ----------------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;

    if (canvas) {
      canvas.scrollTop = canvas.scrollHeight;
    }
  }, [messages.length]);

  /*
   * ---- Clear the composer once the send succeeds -------------------------
   *
   * The draft is cleared during render, not in an effect: the action result is
   * the only signal that a send went through, and reacting to it in an effect
   * would leave the sent text sitting in the box for a frame — which reads as a
   * failed send on a slow connection, exactly when reassurance matters most.
   */
  if (state?.ok && state !== clearedFor) {
    setClearedFor(state);
    setDraft('');
  }

  /*
   * Ask the server for the thread again after a successful send.
   *
   * A safety net rather than the main path: Realtime normally delivers the
   * sender's own row within milliseconds. If the socket is slow or has dropped,
   * this is what stops a message the student definitely sent from being invisible
   * until they navigate away. Cheap, and it refreshes the Messages list preview at
   * the same time.
   */
  useEffect(() => {
    if (clearedFor?.ok) {
      router.refresh();
    }
  }, [clearedFor, router]);

  const groups = groupMessagesByDay(messages);
  const subtitle = [conversation.partnerDegreeName, conversation.courseCode]
    .filter(Boolean)
    .join(' • ');

  return (
    <div className="clay-card flex h-[calc(100vh-13rem)] min-h-100 flex-col overflow-hidden p-0 md:h-[calc(100vh-11rem)]">
      {/* ---- Header --------------------------------------------------------- */}
      <header className="border-outline-variant/30 flex items-center gap-3 border-b bg-white/70 px-4 py-3 backdrop-blur-xl">
        <Link
          href="/messages"
          aria-label="Back to conversations"
          className="text-on-surface-variant hover:bg-surface-container-high focus-visible:ring-brand/35 -ml-2 rounded-full p-2 transition-colors focus-visible:ring-4 focus-visible:outline-none"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>

        <MatchAvatar
          fullName={conversation.partnerName}
          avatarUrl={conversation.partnerAvatarUrl}
          size={40}
          className="border-[3px]"
        />

        <div className="min-w-0">
          <h1 className="font-heading truncate text-[18px] leading-tight font-bold">
            <Link
              href={`/students/${conversation.partnerId}`}
              className="hover:text-brand focus-visible:ring-brand/35 rounded-md transition-colors focus-visible:ring-4 focus-visible:outline-none"
            >
              {conversation.partnerName}
            </Link>
          </h1>
          {/*
            * Degree and course, where the design showed "Psychology • Online".
            * There is no presence tracking in this project (design conflict C7),
            * and a green "Online" dot that means nothing is worse than no dot:
            * a student would wait for a reply that was never coming.
            */}
          {subtitle ? (
            <p className="text-on-surface-variant truncate text-label-sm font-normal">
              {subtitle}
            </p>
          ) : null}
        </div>
      </header>

      {/* ---- Messages ------------------------------------------------------- */}
      <div ref={canvasRef} className="bg-surface-container-low/40 flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-on-surface-variant py-8 text-center text-body-md">
            No messages yet. Say hello.
          </p>
        ) : null}

        {groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <div className="my-2 flex justify-center">
              <span className="bg-surface-container-high text-on-surface-variant rounded-full px-3 py-1 text-[10px] tracking-wider uppercase">
                {group.label}
              </span>
            </div>

            <ul className="flex flex-col gap-4">
              {group.messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  fromMe={message.senderId === viewerId}
                  partnerName={conversation.partnerName}
                  partnerAvatarUrl={conversation.partnerAvatarUrl}
                  /* Last of a run from the partner, matching the design. */
                  showAvatar={
                    group.messages[index + 1]?.senderId !== message.senderId
                  }
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* ---- Composer ------------------------------------------------------- */}
      <form
        ref={formRef}
        action={formAction}
        className="border-surface-container-high border-t bg-white px-4 py-3"
      >
        <input type="hidden" name="conversationId" value={conversation.id} />

        {error ? (
          <p
            id="composer-error"
            role="alert"
            className="text-destructive mb-2 flex items-start gap-2 text-label-sm"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error.message}
          </p>
        ) : null}

        <div className="flex items-end gap-2">
          <div className="bg-field border-outline-variant/30 focus-within:border-brand focus-within:ring-brand/20 flex min-h-11 flex-1 items-center rounded-3xl border px-4 py-2 transition-all focus-within:bg-white focus-within:ring-2">
            <label htmlFor="message-body" className="sr-only">
              Message {conversation.partnerName}
            </label>
            <textarea
              id="message-body"
              name="body"
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                /*
                 * Enter sends, Shift+Enter breaks the line — what every chat
                 * does, and the reason this is a textarea rather than an input.
                 */
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();

                  if (draft.trim().length > 0) {
                    formRef.current?.requestSubmit();
                  }
                }
              }}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder="Type a message..."
              aria-describedby={error ? 'composer-error' : undefined}
              className="text-on-surface placeholder:text-outline max-h-24 w-full resize-none overflow-y-auto bg-transparent py-0 text-[15px] outline-none"
            />
          </div>

          <button
            type="submit"
            /* Nothing to send is not an error worth reporting — just closed. */
            disabled={pending || draft.trim().length === 0}
            aria-label="Send message"
            className="bg-brand hover:bg-brand-bright focus-visible:ring-brand/35 mb-0.5 flex size-11 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
