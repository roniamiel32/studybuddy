/**
 * File:        src/features/course-wall/queries.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Reads for the course wall, the tips, and the class list.
 *
 *              THE VIEW MODELS ARE THE PROFILE WALL'S. A course post is the same
 *              object as a wall post minus the sharing, so it is rendered by the
 *              same shapes — WallPostView and WallCommentView — and the card
 *              components can be shared rather than copied. Inventing a parallel
 *              CoursePostView would have meant two shapes that must stay
 *              identical and no compiler to notice when they stopped.
 *
 *              ERRORS ARE THROWN, NOT SWALLOWED. A malformed embed returns null
 *              data and no rows, which renders as "nothing here yet" — and a
 *              wall that looks empty is indistinguishable from one that failed
 *              to load. The notification feed cost an afternoon to exactly this
 *              shape; see features/notifications/queries.ts.
 * Version:     0.25.0
 *
 * Modifications:
 *     0.25.0 - 2026-08-13 - Initial implementation (Phase 9C)
 */

import 'server-only';

import { createClient, requireUser } from '@/lib/supabase/server';

import type { WallCommentView, WallPostView } from '@/features/wall/wall-view';
import type { CourseMemberView, CourseTipView } from './course-wall-view';

/*
 * NO COMMENTS INSIDE THIS STRING. It is the `select` query parameter PostgREST
 * parses, and supabase-js strips the whitespace out before sending, so a block
 * comment arrives as one unbroken run of letters in the field list and fails the
 * whole request with PGRST100.
 */
const POST_SELECT = `
  id,
  body,
  created_at,
  updated_at,
  author_id,
  profiles!course_posts_author_id_fkey ( full_name, avatar_url ),
  course_post_likes ( profile_id ),
  course_post_comments (
    id, body, created_at, author_id, parent_comment_id,
    profiles!course_post_comments_author_id_fkey ( full_name, avatar_url ),
    course_comment_likes ( profile_id )
  )
`;

interface CommentRow {
  id: string;
  body: string;
  created_at: string;
  author_id: string | null;
  parent_comment_id: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
  course_comment_likes: { profile_id: string }[];
}

interface PostRow {
  id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author_id: string | null;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
  course_post_likes: { profile_id: string }[];
  course_post_comments: CommentRow[];
}

/**
 * Nests replies under the comment they answer.
 *
 * ONE PASS, ONE LEVEL. The trigger allows a reply only on a top-level comment,
 * so this is a partition rather than a tree walk — a recursive builder here
 * would be dead code pretending to handle depth the database refuses.
 *
 * @param rows     - Every comment on the post, in any order.
 * @param viewerId - Who is looking, for the like state and removal rights.
 * @returns Top-level comments, oldest first, each carrying its replies.
 */
function threadComments(rows: CommentRow[], viewerId: string): WallCommentView[] {
  const toView = (row: CommentRow): WallCommentView => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorId: row.author_id,
    /* A comment outlives its author, and says so plainly rather than as "null". */
    authorName: row.profiles?.full_name ?? 'A former student',
    authorAvatarUrl: row.profiles?.avatar_url ?? null,
    /* No wall owner on a course, so only the author may remove their own words. */
    canRemove: row.author_id === viewerId,
    likeCount: row.course_comment_likes.length,
    likedByMe: row.course_comment_likes.some((like) => like.profile_id === viewerId),
    replies: [],
  });

  const oldestFirst = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));

  const topLevel = new Map<string, WallCommentView>();

  for (const row of oldestFirst) {
    if (row.parent_comment_id === null) {
      topLevel.set(row.id, toView(row));
    }
  }

  for (const row of oldestFirst) {
    if (row.parent_comment_id !== null) {
      /* A reply whose parent is not in this post cannot happen — the trigger
         refuses it — but dropping rather than throwing keeps a stray row from
         taking the whole wall down with it. */
      topLevel.get(row.parent_comment_id)?.replies.push(toView(row));
    }
  }

  return [...topLevel.values()];
}

/**
 * The posts on a course's wall, newest first.
 *
 * @param offeringId - Which course.
 * @param limit      - How many to return.
 * @returns The posts.
 */
export async function getCoursePosts(
  offeringId: string,
  limit = 30,
): Promise<WallPostView[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('course_posts')
    .select(POST_SELECT)
    .eq('course_offering_id', offeringId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Could not read the course wall: ${error.message}`);
  }

  return ((data ?? []) as unknown as PostRow[]).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    isEdited: row.updated_at !== row.created_at,
    authorId: row.author_id,
    authorName: row.profiles?.full_name ?? 'A former student',
    authorAvatarUrl: row.profiles?.avatar_url ?? null,
    canRemove: row.author_id === user.id,
    canEdit: row.author_id === user.id,
    likeCount: row.course_post_likes.length,
    likedByMe: row.course_post_likes.some((like) => like.profile_id === user.id),
    comments: threadComments(row.course_post_comments, user.id),
    /* A course post is never a share: there is no second wall to pass it to. */
    shared: null,
  }));
}

/**
 * The other students taking this course.
 *
 * PAGED RATHER THAN CAPPED, because a first-year lecture can hold four hundred
 * people and the widget is one column of a two-column page. It asks for one more
 * row than it needs and reports whether it got it, which is how "Load more"
 * knows whether to render without a second count query.
 *
 * @param offeringId - Which course.
 * @param limit      - How many members to return.
 * @param offset     - How many to skip.
 * @returns The members, and whether more remain.
 */
export async function getCourseMembers(
  offeringId: string,
  limit = 6,
  offset = 0,
): Promise<{ members: CourseMemberView[]; hasMore: boolean }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('enrollments')
    .select('profile_id, profiles ( id, full_name, avatar_url, year_of_study, degrees ( name ) )')
    .eq('course_offering_id', offeringId)
    .neq('profile_id', user.id)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit);

  if (error) {
    throw new Error(`Could not read the class list: ${error.message}`);
  }

  interface MemberRow {
    profile_id: string;
    profiles: {
      id: string;
      full_name: string | null;
      avatar_url: string | null;
      year_of_study: number | null;
      degrees: { name: string } | null;
    } | null;
  }

  const rows = (data ?? []) as unknown as MemberRow[];
  const hasMore = rows.length > limit;

  return {
    members: rows.slice(0, limit).flatMap((row) =>
      row.profiles
        ? [
            {
              id: row.profiles.id,
              fullName: row.profiles.full_name ?? 'A classmate',
              avatarUrl: row.profiles.avatar_url,
              yearOfStudy: row.profiles.year_of_study,
              degreeName: row.profiles.degrees?.name ?? null,
            },
          ]
        : [],
    ),
    hasMore,
  };
}

/**
 * Tips for a course, best-rated first.
 *
 * The ordering is the database's — see rpc_course_tips for why it cannot be an
 * embedded select.
 *
 * @param offeringId - Which course.
 * @returns The tips, highest average rating first.
 */
export async function getCourseTips(offeringId: string): Promise<CourseTipView[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('rpc_course_tips', {
    p_offering_id: offeringId,
  });

  if (error) {
    throw new Error(`Could not read the tips: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    authorId: row.author_id,
    authorName: row.author_name ?? 'A former student',
    authorAvatarUrl: row.author_avatar,
    canRemove: row.author_id === user.id,
    averageStars: Number(row.average_stars),
    ratingCount: Number(row.rating_count),
    myStars: row.my_stars,
  }));
}
