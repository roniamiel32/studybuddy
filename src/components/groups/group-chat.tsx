/**
 * File:        src/components/groups/group-chat.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The group's chat.
 */

'use client';

import { useActionState, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CalendarPlus, Loader2, Send } from 'lucide-react';

import { MeetingChatCard } from '@/components/meetings/meeting-chat-card';
import { ProfileLink } from '@/components/profiles/profile-link';
import { MeetingStrip } from '@/components/meetings/meeting-strip';
import { ScheduleMeetingDialog } from '@/components/meetings/schedule-meeting-dialog';
import { buildChatFeed, type MeetingView } from '@/features/meetings/meeting-view';
import { groupMessageSchema } from '@/features/groups/schema';
import { markGroupRead, postGroupMessage } from '@/features/groups/actions';
import { formatMessageTime } from '@/features/chat/chat-view';
import type { GroupMessageView } from '@/features/groups/group-view';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

export interface GroupChatProps {
  groupId: string;
  initialMessages: GroupMessageView[];
  viewerId: string;
  memberNames: Record<string, string>;
  meetings: MeetingView[];
  groupName: string;
  description?: string | null;
}

function toMessageView(
  row: Record<string, unknown>,
  memberNames: Record<string, string>,
): GroupMessageView {
  const senderId = (row.sender_id as string | null) ?? null;

  return {
    id: String(row.id),
    groupId: String(row.group_id),
    senderId,
    senderName: senderId ? (memberNames[senderId] ?? 'Classmate') : null,
    body: String(row.body),
    isSystem: Boolean(row.is_system),
    createdAt: String(row.created_at),
  };
}

function mergeMessages(
  history: GroupMessageView[],
  live: GroupMessageView[],
): GroupMessageView[] {
  const byId = new Map(history.map((message) => [message.id, message]));

  for (const message of live) {
    byId.set(message.id, message);
  }

  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function GroupChat({
  groupId,
  initialMessages,
  viewerId,
  memberNames,
  meetings,
  groupName,
  description,
}: GroupChatProps) {
  const router = useRouter();
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [schedulerSession, setSchedulerSession] = useState(0);
  const channelId = useId();
  const [live, setLive] = useState<GroupMessageView[]>([]);
  const [state, formAction, pending] = useActionState(postGroupMessage, null);
  const [draft, setDraft] = useState('');
  const [clearedFor, setClearedFor] = useState<typeof state>(null);

  const formRef = useRef<HTMLFormElement>(null);

  const error = state && !state.ok ? state.error : null;
  const messages = useMemo(() => mergeMessages(initialMessages, live), [initialMessages, live]);
  const feed = useMemo(() => buildChatFeed(messages, meetings), [messages, meetings]);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`group-${groupId}-${channelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'study_group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const incoming = toMessageView(payload.new as Record<string, unknown>, memberNames);

          setLive((current) => [
            ...current.filter((message) => message.id !== incoming.id),
            incoming,
          ]);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelId, groupId, memberNames]);

  const newestMessageAt = messages.at(-1)?.createdAt ?? null;

  useEffect(() => {
    void markGroupRead(groupId);
  }, [groupId, newestMessageAt]);

  if (state?.ok && state !== clearedFor) {
    setClearedFor(state);
    setDraft('');
  }

  useEffect(() => {
    if (clearedFor?.ok) {
      router.refresh();
    }
  }, [clearedFor, router]);

  return (
    <section aria-labelledby="group-chat-heading" className="clay-card flex flex-col overflow-hidden p-0">
      
      <h2
        id="group-chat-heading"
        className="border-outline-variant/30 font-heading border-b px-5 py-4 text-headline-md"
      >
        {description || 'Group chat'}
      </h2>

      <MeetingStrip meetings={meetings} />

      <div
        className="bg-surface-container-low/40 flex max-h-[600px] min-h-[400px] flex-1 flex-col-reverse overflow-y-auto p-4"
      >
        {feed.length === 0 ? (
          <p className="text-on-surface-variant m-auto py-6 text-center text-body-md">
            No messages yet. Say hello to the group.
          </p>
        ) : (
          <ul className="flex flex-col-reverse gap-3">
            {[...feed].reverse().map((entry) => {
              if (entry.kind === 'meeting') {
                return (
                  <li key={entry.id}>
                    <MeetingChatCard meeting={entry.meeting} />
                  </li>
                );
              }

              const message = entry.message;

              if (message.isSystem) {
                return (
                  <li key={message.id} className="flex justify-center">
                    <span className="bg-brand-fixed/60 text-on-brand-fixed rounded-full px-3 py-1 text-label-sm">
                      {message.body}
                    </span>
                  </li>
                );
              }

              const fromMe = message.senderId === viewerId;

              return (
                <li
                  key={message.id}
                  className={cn('flex max-w-[85%] flex-col gap-0.5', fromMe && 'self-end')}
                >
                  {!fromMe ? (
                    <ProfileLink
                      profileId={message.senderId}
                      className="text-outline pl-1 text-label-sm font-normal"
                    >
                      {message.senderName ?? 'Classmate'}
                    </ProfileLink>
                  ) : null}

                  <div
                    className={cn(
                      'rounded-2xl p-3',
                      fromMe
                        ? 'bg-brand shadow-clay-soft rounded-br-sm text-white'
                        : 'border-outline-variant/20 rounded-bl-sm border bg-white shadow-sm',
                    )}
                  >
                    <p className="text-[15px] whitespace-pre-wrap">{message.body}</p>
                  </div>

                  <span suppressHydrationWarning
                    className={cn(
                      'text-outline text-[10px]',
                      fromMe ? 'self-end pr-1' : 'pl-1',
                    )}
                  >
                    {formatMessageTime(message.createdAt)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form
        ref={formRef}
        action={formAction}
        className="border-surface-container-high border-t bg-white px-4 py-3"
      >
        <input type="hidden" name="groupId" value={groupId} />

        {error ? (
          <p
            id="group-composer-error"
            role="alert"
            className="text-destructive mb-2 flex items-start gap-2 text-label-sm"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error.message}
          </p>
        ) : null}

        <div className="flex items-end gap-2">
          <div className="bg-field border-outline-variant/30 focus-within:border-brand focus-within:ring-brand/20 flex min-h-11 flex-1 items-center rounded-3xl border px-4 py-2 transition-all focus-within:bg-white focus-within:ring-2">
            <label htmlFor="group-message-body" className="sr-only">
              Message the group
            </label>
            <textarea
              id="group-message-body"
              name="body"
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();

                  if (draft.trim().length > 0) {
                    formRef.current?.requestSubmit();
                  }
                }
              }}
              maxLength={groupMessageSchema.shape.body.maxLength ?? 2000}
              placeholder="Type a message..."
              aria-describedby={error ? 'group-composer-error' : undefined}
              className="text-on-surface placeholder:text-outline max-h-24 w-full resize-none overflow-y-auto bg-transparent py-0 text-[15px] outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setSchedulerSession((current) => current + 1);
              setSchedulerOpen(true);
            }}
            aria-label="Schedule a meeting"
            className="border-outline-variant/60 text-on-surface-variant hover:border-brand hover:text-brand focus-visible:ring-brand/35 mb-0.5 flex size-11 shrink-0 items-center justify-center rounded-full border bg-white transition-colors focus-visible:ring-4 focus-visible:outline-none"
          >
            <CalendarPlus className="size-5" aria-hidden="true" />
          </button>

          <button
            type="submit"
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

      <ScheduleMeetingDialog
        key={schedulerSession}
        open={schedulerOpen}
        onClose={() => setSchedulerOpen(false)}
        groupId={groupId}
        withLabel={groupName}
      />
    </section>
  );
}