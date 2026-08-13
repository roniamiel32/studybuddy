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
 *              A GROUP WITH NO MESSAGES STILL APPEARS, dated by when it was
 *              created. It is a room you are in, and hiding it until somebody
 *              speaks would mean the way into a new group is a tab that no longer
 *              exists.
 * Version:     0.26.0
 *
 * Modifications:
 *     0.26.0 - 2026-08-13 - Initial implementation (Phase 9D)
 */

import 'server-only';

import { createClient, requireUser } from '@/lib/supabase/server';
import { getMyGroups } from '@/features/groups/queries';

import type { GroupThreadView } from './thread-view';

/**
 * How many recent messages to pull across all of the caller's groups.
 *
 * Only the newest per group is kept, so this only has to be large enough that
 * every group is represented. A student in ten talkative groups is covered many
 * times over, and the cost is one small query rather than ten.
 */
const PREVIEW_WINDOW = 300;

/**
 * The caller's group chats, as Messages rows.
 *
 * @returns The group threads, newest activity first.
 */
export async function getGroupThreads(): Promise<GroupThreadView[]> {
  const user = await requireUser();
  const groups = await getMyGroups();

  if (groups.length === 0) {
    return [];
  }

  const supabase = await createClient();

  const { data: messages } = await supabase
    .from('study_group_messages')
    .select('group_id, body, sender_id, is_system, created_at')
    .in(
      'group_id',
      groups.map((group) => group.id),
    )
    .order('created_at', { ascending: false })
    .limit(PREVIEW_WINDOW);

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

  return groups.map((group) => {
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
      unreadCount: null,
      memberCount: group.members.length,
    };
  });
}
