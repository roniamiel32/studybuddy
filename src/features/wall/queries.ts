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
 *     0.21.0 - 2026-08-12 - Likes, comments and shares (Phase 8C)
 *     0.20.0 - 2026-08-11 - Initial implementation (Phase 8B)
 */

import 'server-only';

import { createClient, requireUser } from '@/lib/supabase/server';

import type { WallCommentView, WallPostView } from './wall-view';

/*
 * The shared original is hinted by COLUMN (`original:original_post_id`) rather
 * than by constraint name: PostgREST cannot resolve a self-referencing embed
 * from the constraint, and the error it returns reads as an empty wall unless
 * somebody checks for it — which getWallPosts now does.
 *
 * ONE ROUND TRIP FOR THE WHOLE FEED. Likes, comments and the shared original are
 * embedded rather than fetched per post — a wall of twenty posts would otherwise
 * be sixty queries, and the RLS on each of those tables is already the rule that
 * decides what comes back.
 */
const POST_SELECT = `
  id,
  body,
  created_at,
  updated_at,
  is_edited,
  author_id,
  profile_owner_id,
  original_post_id,
  profiles!wall_posts_author_id_fkey ( full_name, avatar_url ),
  post_likes ( profile_id ),
  post_comments (
    id, body, created_at, author_id, parent_comment_id,
    profiles!post_comments_author_id_fkey ( full_name, avatar_url ),
    comment_likes ( profile_id )
  ),
  original:original_post_id (
    id, body, created_at, author_id, profile_owner_id,
    profiles!wall_posts_author_id_fkey ( full_name, avatar_url ),
    owner:profiles!wall_posts_profile_owner_id_fkey ( full_name )
  )
`;

interface CommentRow {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  parent_comment_id: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
  comment_likes: { profile_id: string }[];
}

interface WallPostRow {
  id: string;
  body: string | null;
  created_at: string;
  is_edited: boolean;
  author_id: string | null;
  profile_owner_id: string;
  original_post_id: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
  post_likes: { profile_id: string }[];
  post_comments: CommentRow[];
  original: {
    id: string;
    body: string | null;
    created_at: string;
    author_id: string | null;
    profile_owner_id: string;
    profiles: { full_name: string | null; avatar_url: string | null } | null;
    owner: { full_name: string | null } | null;
  } | null;
}

/**
 * Nests replies under the comment they answer.
 *
 * ONE PASS, ONE LEVEL. The schema allows a reply only on a top-level comment, so
 * this is a partition rather than a tree walk — and a recursive builder here
 * would be dead code pretending to handle depth the database refuses.
 *
 * Everything arrives in one embedded select, so grouping in memory costs nothing
 * a second query would not cost more.
 *
 * @param rows           - Every comment on the post, in any order.
 * @param viewerId       - Who is looking, for the like state and removal rights.
 * @param profileOwnerId - Whose wall it is; they may remove anything on it.
 * @returns Top-level comments, oldest first, each carrying its replies.
 */
function threadComments(
  rows: CommentRow[],
  viewerId: string,
  profileOwnerId: string,
): WallCommentView[] {
  const toView = (row: CommentRow): WallCommentView => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorId: row.author_id,
    authorName: row.profiles?.full_name ?? 'A former student',
    authorAvatarUrl: row.profiles?.avatar_url ?? null,
    canRemove: row.author_id === viewerId || profileOwnerId === viewerId,
    likeCount: row.comment_likes.length,
    likedByMe: row.comment_likes.some((like) => like.profile_id === viewerId),
    replies: [],
  });

  const oldestFirst = (a: { createdAt: string }, b: { createdAt: string }) =>
    a.createdAt.localeCompare(b.createdAt);

  const tops = new Map<string, WallCommentView>();

  for (const row of rows) {
    if (row.parent_comment_id === null) {
      tops.set(row.id, toView(row));
    }
  }

  for (const row of rows) {
    if (row.parent_comment_id !== null) {
      /* A reply whose parent is not in this post cannot happen — the trigger
         refuses it — but dropping rather than throwing keeps a stray row from
         taking the whole wall down with it. */
      tops.get(row.parent_comment_id)?.replies.push(toView(row));
    }
  }

  const threads = [...tops.values()].sort(oldestFirst);

  for (const thread of threads) {
    thread.replies.sort(oldestFirst);
  }

  return threads;
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

  const { data, error } = await supabase
    .from('wall_posts')
    .select(POST_SELECT)
    .eq('profile_owner_id', profileOwnerId)
    .order('created_at', { ascending: false })
    .limit(limit);

  /*
   * Reported rather than swallowed. A malformed embed returns null data and no
   * rows, which renders as "nothing on this wall yet" — a wall that looks empty
   * is indistinguishable from a wall that failed to load, and this exact shape
   * cost an afternoon once already.
   */
  if (error) {
    throw new Error(`Could not read the wall: ${error.message}`);
  }

  return ((data ?? []) as unknown as WallPostRow[]).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    isEdited: row.is_edited,
    authorId: row.author_id,
    /* A post outlives its author, and says so plainly rather than as "null". */
    authorName: row.profiles?.full_name ?? 'A former student',
    authorAvatarUrl: row.profiles?.avatar_url ?? null,
    canRemove: row.author_id === user.id || profileOwnerId === user.id,
    /* Only the author rewrites words. The wall's owner may remove a post from
       their profile, but editing what someone said would be putting words in
       their mouth. */
    canEdit: row.author_id === user.id,
    likeCount: row.post_likes.length,
    likedByMe: row.post_likes.some((like) => like.profile_id === user.id),
    comments: threadComments(row.post_comments, user.id, profileOwnerId),
    shared: row.original
      ? {
          postId: row.original.id,
          body: row.original.body ?? '',
          createdAt: row.original.created_at,
          authorId: row.original.author_id,
          authorName: row.original.profiles?.full_name ?? 'A former student',
          authorAvatarUrl: row.original.profiles?.avatar_url ?? null,
          ownerId: row.original.profile_owner_id,
          ownerName: row.original.owner?.full_name ?? 'a classmate',
        }
      : null,
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
