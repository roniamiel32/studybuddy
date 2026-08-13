/**
 * File:        src/components/courses/course-post-card.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: One post on a course wall.
 *
 *              SMALLER THAN ITS PROFILE SIBLING BY DESIGN, not by omission. A
 *              course post cannot be shared — there is no second wall to pass it
 *              to — and it cannot be removed by anyone but its author, because a
 *              course has no owner to appeal to. Both differences are decisions
 *              taken in the schema, so the card that renders them has fewer
 *              controls rather than disabled ones.
 * Version:     0.25.0
 *
 * Modifications:
 *     0.25.0 - 2026-08-13 - Initial implementation (Phase 9C)
 */

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertCircle, Heart, MessageCircle, Trash2 } from 'lucide-react';

import { CourseCommentThread } from '@/components/courses/course-comment-thread';
import { MatchAvatar } from '@/components/matching/match-avatar';
import { removeCoursePost, toggleCoursePostLike } from '@/features/course-wall/actions';
import { timeAgo } from '@/features/notifications/notification-view';
import type { WallPostView } from '@/features/wall/wall-view';
import { cn } from '@/lib/utils';

export interface CoursePostCardProps {
  post: WallPostView;
  offeringId: string;
}

/**
 * Renders one course post.
 *
 * @param post       - The post.
 * @param offeringId - The course it belongs to.
 * @returns The article element.
 */
export function CoursePostCard({ post, offeringId }: CoursePostCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showComments, setShowComments] = useState(post.comments.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /* Optimistic, because a like that waits for a round trip feels broken. */
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [removed, setRemoved] = useState(false);

  if (removed) {
    return null;
  }

  const commentCount = post.comments.reduce(
    (total, comment) => total + 1 + comment.replies.length,
    0,
  );

  return (
    <article className="border-outline-variant/40 rounded-xl border bg-white p-4 shadow-sm">
      <header className="flex items-start gap-3">
        {post.authorId ? (
          <Link href={`/students/${post.authorId}`} className="shrink-0">
            <MatchAvatar
              fullName={post.authorName}
              avatarUrl={post.authorAvatarUrl}
              size={40}
            />
          </Link>
        ) : (
          <MatchAvatar fullName={post.authorName} avatarUrl={null} size={40} />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-label-md">
            {post.authorId ? (
              <Link href={`/students/${post.authorId}`} className="hover:text-brand">
                {post.authorName}
              </Link>
            ) : (
              post.authorName
            )}
          </p>
          <p className="text-outline text-label-sm font-normal">
            {timeAgo(post.createdAt)}
            {post.isEdited ? ' · edited' : ''}
          </p>
        </div>

        {post.canRemove ? (
          <div className="flex shrink-0 items-center gap-2">
            {confirmingDelete ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const result = await removeCoursePost({ postId: post.id, offeringId });

                      if (result.ok) {
                        setRemoved(true);
                      } else {
                        setError(result.error.message);
                        setConfirmingDelete(false);
                      }
                    });
                  }}
                  className="text-destructive text-label-sm font-semibold"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="text-outline hover:text-on-surface text-label-sm"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                aria-label="Remove this post"
                className="text-outline hover:text-destructive transition-colors"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        ) : null}
      </header>

      <p className="text-body-md mt-3 text-pretty whitespace-pre-wrap">{post.body}</p>

      {error ? (
        <p role="alert" className="text-destructive mt-2 flex items-start gap-2 text-label-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="text-outline border-outline-variant/40 mt-3 flex items-center gap-4 border-t pt-2 text-label-sm font-normal">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const next = !liked;
            setLiked(next);
            setLikeCount((count) => count + (next ? 1 : -1));
            setError(null);

            startTransition(async () => {
              const result = await toggleCoursePostLike({ postId: post.id, offeringId });

              if (!result.ok) {
                setLiked(!next);
                setLikeCount((count) => count + (next ? -1 : 1));
                setError(result.error.message);
              }
            });
          }}
          className={cn(
            'hover:text-brand flex items-center gap-1.5 transition-colors',
            liked && 'text-brand',
          )}
        >
          <Heart className={cn('size-4', liked && 'fill-current')} aria-hidden="true" />
          {likeCount > 0 ? likeCount : null}
          <span className="sr-only">{liked ? 'Unlike' : 'Like'} this post</span>
        </button>

        <button
          type="button"
          onClick={() => setShowComments((shown) => !shown)}
          aria-expanded={showComments}
          className="hover:text-brand flex items-center gap-1.5 transition-colors"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          {commentCount > 0 ? commentCount : null}
          <span className={commentCount > 0 ? 'sr-only' : undefined}>Comment</span>
        </button>
      </div>

      {showComments ? (
        <CourseCommentThread
          postId={post.id}
          offeringId={offeringId}
          comments={post.comments}
        />
      ) : null}
    </article>
  );
}
