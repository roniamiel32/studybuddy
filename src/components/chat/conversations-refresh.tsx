/**
 * File:        src/components/chat/conversations-refresh.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Keeps the server-rendered Messages list current.
 *
 *              Renders nothing. It subscribes to message changes and calls
 *              router.refresh(), so the list re-renders on the server with fresh
 *              previews, timestamps and unread counts.
 *
 *              WHY NOT HOLD THE LIST IN CLIENT STATE: a conversation row is a
 *              join across profiles, degrees, courses and the newest message. A
 *              client-side update would have to reproduce all of that from a
 *              single message payload, and would get it wrong the first time a
 *              row's shape changed. Re-rendering on the server keeps one
 *              implementation of the query.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3)
 */

'use client';

import { useEffect, useId } from 'react';
import { useRouter } from 'next/navigation';

import { createClient } from '@/lib/supabase/client';

/**
 * Refreshes the current route when a message arrives or is read.
 *
 * @returns Nothing; this component renders no markup.
 */
export function ConversationsRefresh() {
  const router = useRouter();
  /* Unique per instance — a Supabase client keeps one channel per name, and a
     shared name throws when a second component subscribes to it. */
  const channelId = useId();

  useEffect(() => {
    const supabase = createClient();

    /*
     * No filter: RLS already limits the stream to this student's own
     * conversations, and "conversations I am in" is a join that a
     * single-column postgres_changes filter cannot express anyway.
     */
    const channel = supabase
      .channel(`conversation-list-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
        router.refresh();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversations' }, () => {
        router.refresh();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelId, router]);

  return null;
}
