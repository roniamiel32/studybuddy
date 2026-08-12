/**
 * File:        src/features/wall/queries.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Reads for the social wall.
 *
 *              The RLS policy already decides who may read a wall — anyone who
 *              may see the profile — so this query has no visibility branch of
 *              its own. What it does add is `canRemove` per post, because the
 *              rule there is not "your own": the wall's owner may remove anything
 *              on it, and only the row knows which case applies.
 * Version:     0.20.0
 *
 * Modifications:
 *     0.20.0 - 2026-08-11 - Initial implementation (Phase 8B)
 */

import 'server-only';

import { createClient, requireUser } from '@/lib/supabase/server';

import type { WallPostView } from './wall-view';

interface WallPostRow {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
}

/**
 * The posts on one student's wall, newest first.
 *
 * @param profileOwnerId - Whose wall.
 * @param limit          - How many to return.
 * @returns The posts.
 */
export async function getWallPosts(
  profileOwnerId: string,
  limit = 30,
): Promise<WallPostView[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('wall_posts')
    .select('id, body, created_at, author_id, profiles!wall_posts_author_id_fkey ( full_name, avatar_url )')
    .eq('profile_owner_id', profileOwnerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return ((data ?? []) as unknown as WallPostRow[]).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorId: row.author_id,
    /* A post outlives its author, and says so plainly rather than as "null". */
    authorName: row.profiles?.full_name ?? 'A former student',
    authorAvatarUrl: row.profiles?.avatar_url ?? null,
    canRemove: row.author_id === user.id || profileOwnerId === user.id,
  }));
}

/**
 * Whether the caller may write on this wall.
 *
 * Asks the database the same question the INSERT policy asks, rather than
 * reimplementing "what a connection is" in TypeScript — the same reason the
 * rating button reads app_shared_completed_meeting.
 *
 * @param profileOwnerId - Whose wall.
 * @returns True when they may post.
 */
export async function canPostOnWall(profileOwnerId: string): Promise<boolean> {
  const user = await requireUser();

  if (user.id === profileOwnerId) {
    return true;
  }

  const supabase = await createClient();

  const { data } = await supabase.rpc('app_is_connection', {
    profile_a: user.id,
    profile_b: profileOwnerId,
  });

  return data === true;
}
