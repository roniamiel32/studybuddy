/**
 * File:        src/components/courses/course-comment-thread.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Comments and replies under a course post.
 *
 *              ONE LEVEL, and the component says so by rendering replies from a
 *              field rather than by calling itself. The database refuses a reply
 *              to a reply, so a recursive renderer here would be code that can
 *              never run pretending to handle a case that cannot arise.
 *
 *              A SIBLING OF comment-thread.tsx, NOT A COPY OF IT. The profile
 *              version answers to a wall owner who may remove anything on their
 *              own wall; a course has no owner, so here the author is the only
 *              person who can remove their words. That difference runs through
 *              every permission in the file, which is why it is a separate one.
 * Version:     0.25.0
 *
 * Modifications:
 *     0.25.0 - 2026-08-13 - Initial implementation (Phase 9C)
 */

'use client';

import { useActionState, useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertCircle, Heart, Loader2, Send, Trash2 } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import {
  createCourseComment,
  removeCourseComment,
  toggleCourseCommentLike,
} from '@/features/course-wall/actions';
import { timeAgo } from '@/features/notifications/notification-view';
import type { WallCommentView } from '@/features/wall/wall-view';
import { cn } from '@/lib/utils';

export interface CourseCommentThreadProps {
  postId: string;
  offeringId: string;
  comments: WallCommentView[];
}

/**
 * Renders the comments on a post, with the composer beneath them.
 *
 * @param props - The post, its course, and the comments already on it.
 * @returns The thread element.
 */
export function CourseCommentThread({
  postId,
  offeringId,
  comments,
}: CourseCommentThreadProps) {
  const [state, formAction, posting] = useActionState(createCourseComment, null);
  const [draft, setDraft] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  /* One success clears the box once, the same shape the chat composer uses. */
  const [clearedFor, setClearedFor] = useState<typeof state>(null);

  if (state?.ok === true && state !== clearedFor) {
    setClearedFor(state);
    setDraft('');
    setReplyingTo(null);
  }

  const error = state && !state.ok ? state.error : null;

  return (
    <div className="border-outline-variant/40 mt-3 flex flex-col gap-3 border-t pt-3">
      {comments.map((comment) => (
        <CommentRow
          key={comment.id}
          comment={comment}
          offeringId={offeringId}
          onReply={() => setReplyingTo(comment.id)}
          isReplyTarget={replyingTo === comment.id}
        />
      ))}

      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="postId" value={postId} />
        <input type="hidden" name="offeringId" value={offeringId} />
        {replyingTo ? (
          <input type="hidden" name="parentCommentId" value={replyingTo} />
        ) : null}

        {replyingTo ? (
          <p className="text-outline flex items-center gap-2 text-label-sm font-normal">
            Replying to a comment
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-brand rounded-sm underline underline-offset-2"
            >
              Cancel
            </button>
          </p>
        ) : null}

        <div className="bg-field border-outline-variant/30 focus-within:border-brand focus-within:ring-brand/20 flex items-end gap-2 rounded-2xl border px-3 py-1.5 transition-all focus-within:bg-white focus-within:ring-2">
          <label htmlFor={`comment-${postId}`} className="sr-only">
            {replyingTo ? 'Write a reply' : 'Write a comment'}
          </label>
          <textarea
            id={`comment-${postId}`}
            name="body"
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={500}
            placeholder={replyingTo ? 'Write a reply...' : 'Write a comment...'}
            className="text-on-surface placeholder:text-outline max-h-32 w-full resize-none bg-transparent py-1.5 text-[15px] outline-none"
          />
          <button
            type="submit"
            disabled={posting || draft.trim().length === 0}
            aria-label={replyingTo ? 'Post reply' : 'Post comment'}
            className="bg-brand hover:bg-brand-bright focus-visible:ring-brand/35 mb-1 flex size-8 shrink-0 items-center justify-center rounded-full text-white transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {posting ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="size-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {error ? (
          <p role="alert" className="text-destructive flex items-start gap-2 text-label-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error.message}
          </p>
        ) : null}
      </form>
    </div>
  );
}

/**
 * One comment, and its replies.
 *
 * @param props - The comment, its course, and the reply controls.
 * @returns The comment element.
 */
function CommentRow({
  comment,
  offeringId,
  onReply,
  isReplyTarget,
  isReply = false,
}: {
  comment: WallCommentView;
  offeringId: string;
  onReply?: () => void;
  isReplyTarget?: boolean;
  isReply?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /* Optimistic: a like that waits for a round trip feels broken. The server is
     still the authority — a refusal puts it back. */
  const [liked, setLiked] = useState(comment.likedByMe);
  const [likeCount, setLikeCount] = useState(comment.likeCount);
  const [removed, setRemoved] = useState(false);

  if (removed) {
    return null;
  }

  return (
    <div className={cn('flex gap-2', isReply && 'ml-8')}>
      {comment.authorId ? (
        <Link href={`/students/${comment.authorId}`} className="shrink-0">
          <MatchAvatar
            fullName={comment.authorName}
            avatarUrl={comment.authorAvatarUrl}
            size={28}
          />
        </Link>
      ) : (
        <MatchAvatar fullName={comment.authorName} avatarUrl={null} size={28} />
      )}

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'bg-surface-container rounded-2xl px-3 py-2',
            isReplyTarget && 'ring-brand/35 ring-2',
          )}
        >
          <p className="text-label-md">
            {comment.authorId ? (
              <Link href={`/students/${comment.authorId}`} className="hover:text-brand">
                {comment.authorName}
              </Link>
            ) : (
              comment.authorName
            )}
          </p>
          <p className="text-body-md text-pretty whitespace-pre-wrap">{comment.body}</p>
        </div>

        <div className="text-outline mt-1 flex flex-wrap items-center gap-3 pl-1 text-label-sm font-normal">
          <span>{timeAgo(comment.createdAt)}</span>

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              const next = !liked;
              setLiked(next);
              setLikeCount((count) => count + (next ? 1 : -1));
              setError(null);

              startTransition(async () => {
                const result = await toggleCourseCommentLike({
                  commentId: comment.id,
                  offeringId,
                });

                if (!result.ok) {
                  setLiked(!next);
                  setLikeCount((count) => count + (next ? -1 : 1));
                  setError(result.error.message);
                }
              });
            }}
            className={cn(
              'hover:text-brand flex items-center gap-1 transition-colors',
              liked && 'text-brand',
            )}
          >
            <Heart className={cn('size-3.5', liked && 'fill-current')} aria-hidden="true" />
            {likeCount > 0 ? likeCount : null}
            <span className="sr-only">{liked ? 'Unlike' : 'Like'} this comment</span>
          </button>

          {/* Replies do not get a reply button: the schema allows one level. */}
          {!isReply && onReply ? (
            <button type="button" onClick={onReply} className="hover:text-brand transition-colors">
              Reply
            </button>
          ) : null}

          {comment.canRemove ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await removeCourseComment({
                    commentId: comment.id,
                    offeringId,
                  });

                  if (result.ok) {
                    setRemoved(true);
                  } else {
                    setError(result.error.message);
                  }
                });
              }}
              className="hover:text-destructive flex items-center gap-1 transition-colors"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Remove this comment</span>
            </button>
          ) : null}
        </div>

        {error ? (
          <p role="alert" className="text-destructive mt-1 pl-1 text-label-sm">
            {error}
          </p>
        ) : null}

        {comment.replies.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            {comment.replies.map((reply) => (
              <CommentRow
                key={reply.id}
                comment={reply}
                offeringId={offeringId}
                isReply
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
