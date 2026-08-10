/**
 * File:        src/components/layout/unread-badge.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The red count over the Requests tab, and the hook behind it.
 *
 *              Seeded from the server so it is correct on first paint, then kept
 *              current by a Realtime subscription — the count must not wait for a
 *              navigation to catch up, since the whole point is telling a student
 *              something arrived while they were looking elsewhere.
 *
 *              WHY IT SUBSCRIBES TO EVERY MESSAGE ROW rather than filtering:
 *              postgres_changes filters are single-column equality, and the
 *              condition here is "in a conversation I am part of", which is a
 *              join. RLS already enforces exactly that on the stream, so the
 *              socket only ever carries rows this student is allowed to see. The
 *              filter would be a second, weaker copy of a rule the database is
 *              already applying.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3)
 */

'use client';

import { useEffect, useId, useState } from 'react';

import { formatBadgeCount } from '@/features/chat/chat-view';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

/**
 * Tracks the unread total, seeded by the server and kept live by Realtime.
 *
 * A hook rather than state inside the badge, because the count is needed in two
 * places within one navigation link: the red circle over the icon, and the
 * screen-reader sentence that has to come AFTER the label. Announcing
 * "2 unread messages, Requests" puts the number before the thing it counts.
 *
 * @param initialCount - Count rendered on the server.
 * @param viewerId     - The signed-in student.
 * @returns The current unread total.
 */
export function useUnreadCount(initialCount: number, viewerId: string): number {
  /*
   * One channel per hook instance, and the id is what guarantees it.
   *
   * createBrowserClient memoises its client, and that client keeps ONE channel
   * per name — so `channel('unread-messages')` hands back the same object to
   * every caller. Both navigation bars render a badge (desktop and mobile), so
   * with a fixed name the second one called .on() on a channel the first had
   * already subscribed, which throws and takes the whole page down with it.
   */
  const channelId = useId();
  const [count, setCount] = useState(initialCount);
  const [lastServerCount, setLastServerCount] = useState(initialCount);

  /*
   * A fresher server render wins.
   *
   * The layout re-renders with a new count after a mark-as-read, and that number
   * is more authoritative than whatever the socket last said. Adjusted during
   * render rather than in an effect: React re-runs this component immediately
   * with the new state and never commits the stale paint, whereas an effect
   * would show the old count for a frame first.
   */
  if (initialCount !== lastServerCount) {
    setLastServerCount(initialCount);
    setCount(initialCount);
  }

  useEffect(() => {
    const supabase = createClient();

    /**
     * Re-counts from the database.
     *
     * Deliberately a fresh count rather than incrementing on each event. An
     * increment is only correct if every event is received exactly once, and a
     * socket that drops and reconnects breaks that assumption silently — leaving
     * a badge that says 3 forever. Re-counting is one cheap indexed query and
     * cannot drift.
     */
    const recount = async () => {
      const { count: fresh } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
        .neq('sender_id', viewerId);

      setCount(fresh ?? 0);
    };

    /*
     * No row filter. postgres_changes filters are single-column equality, and the
     * condition here is "in a conversation I am part of", which is a join. RLS
     * already enforces exactly that on the stream, so the socket only ever
     * carries rows this student is allowed to see.
     */
    const channel = supabase
      .channel(`unread-messages-${channelId}`)
      /* A new message may raise the count. */
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, recount)
      /* is_read flipping lowers it — including from this student's other tab. */
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, recount)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelId, viewerId]);

  return count;
}

/**
 * The red circle over a navigation icon.
 *
 * @param count   - The unread total.
 * @param variant - Which navigation bar this is in.
 * @returns The badge element, or null when there is nothing unread.
 */
export function UnreadDot({
  count,
  variant = 'desktop',
}: {
  count: number;
  variant?: 'desktop' | 'mobile';
}) {
  const label = formatBadgeCount(count);

  /* Hidden completely at zero, as specified — not a zero in a circle. */
  if (!label) {
    return null;
  }

  return (
    <span
      /* Decorative: UnreadText carries the meaning for a screen reader. */
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute flex items-center justify-center rounded-full bg-red-600 font-bold text-white ring-2 ring-white',
        variant === 'desktop'
          ? '-top-1 -right-1 min-w-4 px-1 text-[10px] leading-4'
          : 'top-0 right-1/2 min-w-4 translate-x-3 px-1 text-[10px] leading-4',
      )}
    >
      {label}
    </span>
  );
}

/**
 * The screen-reader half of the badge.
 *
 * Rendered after the label so the link announces "Requests, 2 unread messages".
 * aria-live is deliberately absent: this sits inside a navigation link, and
 * announcing every arriving message would talk over whatever the student is
 * actually doing.
 *
 * @param count - The unread total.
 * @returns Visually hidden text, or null when there is nothing unread.
 */
export function UnreadText({ count }: { count: number }) {
  if (count <= 0) {
    return null;
  }

  return (
    <span className="sr-only">
      , {count} unread {count === 1 ? 'message' : 'messages'}
    </span>
  );
}
