/**
 * File:        src/features/chat/group-threads.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Group chats, shaped for the Messages tab.
 *
 *              ONE QUERY FOR THE PREVIEWS, not one per group. The obvious
 *              implementation asks each group for its newest message and is N+1
 *              requests for a student in six groups; this pulls the recent
 *              messages for every group at once and keeps the first it sees per
 *              group, which the ordering makes the newest.
 *
 *              THE UNREAD COUNT IS NOT COUNTED FROM THAT WINDOW, and this is the
 *              bug Phase 9E fixed. Counting "messages from other people" inside a
 *              300-row preview window gave two wrong answers at once: it never
 *              fell as the student read anything, because nothing recorded that
 *              they had; and it undercounted any group busier than the window is
 *              wide. Both are gone — rpc_group_unread_counts compares every
 *              message against `study_group_members.last_seen_at` in SQL, so the
 *              number is exact and drops to zero when the chat is opened.
 *
 *              A GROUP WITH NO MESSAGES STILL APPEARS, dated by when it was
 *              created. It is a room you are in, and hiding it until somebody
 *              speaks would mean the way into a new group is a tab that no longer
 *              exists.
 * Version:     0.26.0
 *
 * Modifications:
 *     0.27.0 - 2026-08-13 - Unread counted against last_seen_at (Phase 9E)
 *     0.26.0 - 2026-08-13 - Initial implementation (Phase 9D)
 */

import 'server-only';

import { createClient, requireUser } from '@/lib/supabase/server';
import { getMyGroups } from '@/features/groups/queries';
import { getHiddenThreads, isStillHidden } from '@/features/chat/hidden-threads';

import type { GroupThreadView } from './thread-view';

/**
 * How many recent messages to pull across all of the caller's groups.
 *
 * PREVIEWS ONLY. Only the newest per group is kept, so this has to be large
 * enough that every group is represented — not large enough to be counted. The
 * unread totals come from the database, precisely so this window's size cannot
 * affect them.
 */
const PREVIEW_WINDOW = 300;

/**
 * The caller's group chats, as Messages rows.
 *
 * @returns The group threads, each with its preview and its unread count.
 */
export async function getGroupThreads(): Promise<GroupThreadView[]> {
  const user = await requireUser();
  const groups = await getMyGroups();

  if (groups.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const groupIds = groups.map((group) => group.id);

  const [{ data: messages }, { data: unread }, hidden] = await Promise.all([
    supabase
      .from('study_group_messages')
      .select('group_id, body, sender_id, is_system, created_at')
      .in('group_id', groupIds)
      .order('created_at', { ascending: false })
      .limit(PREVIEW_WINDOW),
    /* Every group the caller is in, counted against their own last_seen_at —
       see the function's comment for why joining and system lines are excluded. */
    supabase.rpc('rpc_group_unread_counts'),
    getHiddenThreads(),
  ]);

  interface PreviewRow {
    group_id: string;
    body: string;
    sender_id: string | null;
    is_system: boolean;
    created_at: string;
  }

  const newestByGroup = new Map<string, PreviewRow>();

  for (const row of (messages ?? []) as PreviewRow[]) {
    /* Ordered newest first, so the first sighting of a group is its latest. */
    if (!newestByGroup.has(row.group_id)) {
      newestByGroup.set(row.group_id, row);
    }
  }

  const unreadByGroup = new Map<string, number>(
    (unread ?? []).map((row) => [row.group_id, Number(row.unread_count)]),
  );

  return groups
    .map((group) => {
      const latest = newestByGroup.get(group.id);

      return {
        kind: 'group' as const,
        id: group.id,
        /* The existing group chat view, untouched — members sidebar, study
           sessions and message board. Only the way in has changed. */
        href: `/groups/${group.id}`,
        title: group.name,
        avatarUrl: null,
        subtitle:
          group.members.length === 1 ? '1 member' : `${group.members.length} members`,
        lastMessageAt: latest?.created_at ?? group.createdAt,
        lastMessageBody: latest?.body ?? null,
        /* A system line ("Maya joined") is nobody's message, so it is never
           prefixed with "You:". */
        lastMessageFromMe: Boolean(latest && !latest.is_system && latest.sender_id === user.id),
        /* Absent from the RPC's result means no membership row came back, which
           cannot happen for a group getMyGroups just returned — but zero is the
           right answer if it ever does. */
        unreadCount: unreadByGroup.get(group.id) ?? 0,
        memberCount: group.members.length,
      };
    })
    /*
     * Cleared threads drop out here, after the row is assembled, because "still
     * hidden" is a comparison against the newest message. Clearing a group chat
     * does not leave the group — anyone saying anything brings it back, and
     * leaving is a separate, deliberate act on the group page.
     */
    .filter((thread) => !isStillHidden(hidden.groups.get(thread.id), thread.lastMessageAt));
}
