/**
 * File:        src/features/chat/hidden-threads.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Clearing a thread from your own Messages list, and putting it
 *              back when somebody speaks.
 *
 *              ONE-SIDED BY CONSTRUCTION. The row is keyed on (person, thread),
 *              so hiding is something that happens to a list rather than to a
 *              conversation — the other participant keeps it and its whole
 *              history, and nothing here can reach their view even by mistake.
 *
 *              HIDDEN UNTIL SOMETHING NEW. The comparison is `hidden_at` against
 *              the thread's newest message, not a boolean, so a reply brings the
 *              thread back. Clearing a chat is tidying up, not blocking somebody:
 *              a version that swallowed the next message would quietly lose mail,
 *              which is the one thing a messaging list must never do.
 * Version:     0.28.0
 *
 * Modifications:
 *     0.28.0 - 2026-08-13 - Initial implementation (Phase 9F)
 */

import 'server-only';

import { createClient, requireUser } from '@/lib/supabase/server';

export interface HiddenThreads {
  /** Conversation id to the moment it was cleared. */
  conversations: Map<string, string>;
  /** Group id to the moment it was cleared. */
  groups: Map<string, string>;
}

/**
 * Everything the caller has cleared from their Messages list.
 *
 * Read once per page and passed to both thread queries, rather than each of them
 * asking: they render into one list, and two reads could disagree about it.
 *
 * @returns The hidden markers, by kind.
 */
export async function getHiddenThreads(): Promise<HiddenThreads> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('hidden_threads')
    .select('conversation_id, group_id, hidden_at')
    .eq('profile_id', user.id);

  const conversations = new Map<string, string>();
  const groups = new Map<string, string>();

  for (const row of data ?? []) {
    if (row.conversation_id) {
      conversations.set(row.conversation_id, row.hidden_at);
    } else if (row.group_id) {
      groups.set(row.group_id, row.hidden_at);
    }
  }

  return { conversations, groups };
}

/**
 * Whether a thread should stay out of the list.
 *
 * @param hiddenAt      - When it was cleared, or undefined if it never was.
 * @param lastMessageAt - The thread's newest message.
 * @returns True when it is still hidden.
 */
export function isStillHidden(
  hiddenAt: string | undefined,
  lastMessageAt: string,
): boolean {
  if (!hiddenAt) {
    return false;
  }

  /*
   * Compared as strings: both are ISO-8601 UTC out of Postgres, which sorts
   * identically lexicographically and numerically, without building two Date
   * objects per thread.
   *
   * `>=` rather than `>`, so clearing a thread whose newest message arrived in
   * the same instant hides it rather than leaving it visibly untouched.
   */
  return hiddenAt >= lastMessageAt;
}
