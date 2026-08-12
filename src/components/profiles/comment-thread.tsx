/**
 * File:        src/components/profiles/comment-thread.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The comments under a post — likes, replies, and the composers.
 *
 *              ONE LEVEL OF INDENT, matching the schema. A reply may only answer
 *              a top-level comment, so this renders a list of threads rather than
 *              recursing: the shape of the component says what the database will
 *              accept, and there is no depth here that cannot be reached.
 *
 *              THE REPLY BOX OPENS UNDER THE COMMENT IT ANSWERS, and closes when
 *              the reply lands. Anywhere else and a student answering the third
 *              comment in a long thread has to remember which one they meant.
 *
 *              LIKES ARE OPTIMISTIC. A heart that waits for a round trip feels
 *              broken; the server is still the authority, and a refusal puts the
 *              count back where it was.
 * Version:     0.22.0
 *
 * Modifications:
 *     0.22.0 - 2026-08-12 - Initial implementation (Phase 8D)
 */

'use client';

import { useActionState, useState, useTransition } from 'react';
import { AlertCircle, Heart, Loader2, Send, X } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { createComment, removeComment, toggleCommentLike } from '@/features/wall/actions';
import type { WallCommentView } from '@/features/wall/wall-view';
import { timeAgo } from '@/features/notifications/notification-view';
import { cn } from '@/lib/utils';

export interface CommentThreadProps {
  postId: string;
  profileOwnerId: string;
  comments: WallCommentView[];
}

/**
 * Renders every comment on a post, replies nested under their parent.
 *
 * @param props - The post, the wall it is on, and its comments.
 * @returns The comment section.
 */
export function CommentThread({ postId, profileOwnerId, comments }: CommentThreadProps) {
  return (
    <>
      {comments.length > 0 ? (
        <ul aria-label="Comments" className="mb-3 flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id}>
              <Comment
                comment={comment}
                postId={postId}
                profileOwnerId={profileOwnerId}
                canReply
              />

              {comment.replies.length > 0 ? (
                /* The single indent. ms-9 lines replies up with the parent's text
                   rather than its avatar, which is what makes the thread read as
                   one conversation instead of two columns. */
                <ul aria-label={`Replies to ${comment.authorName}`} className="ms-9 mt-3 flex flex-col gap-3">
                  {comment.replies.map((reply) => (
                    <li key={reply.id}>
                      <Comment
                        comment={reply}
                        postId={postId}
                        profileOwnerId={profileOwnerId}
                        canReply={false}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <CommentComposer postId={postId} profileOwnerId={profileOwnerId} />
    </>
  );
}

/**
 * One comment or reply, with its like, reply and remove controls.
 *
 * @param props - The comment, and whether replying to it is allowed.
 * @returns The comment element.
 */
function Comment({
  comment,
  postId,
  profileOwnerId,
  canReply,
}: {
  comment: WallCommentView;
  postId: string;
  profileOwnerId: string;
  canReply: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /* Optimistic; the server is still the authority. */
  const [liked, setLiked] = useState(comment.likedByMe);
  const [likeCount, setLikeCount] = useState(comment.likeCount);

  return (
    <>
      <div className="flex items-start gap-2">
        <MatchAvatar
          fullName={comment.authorName}
          avatarUrl={comment.authorAvatarUrl}
          size={28}
          className="border"
        />

        <div className="min-w-0 flex-1">
          <div className="bg-surface-container-low rounded-2xl px-3 py-2">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-label-sm">{comment.authorName}</span>
              <span className="text-outline text-label-sm font-normal">
                {timeAgo(comment.createdAt)}
              </span>
            </p>
            <p className="text-on-surface text-body-md break-words whitespace-pre-line">
              {comment.body}
            </p>
          </div>

          {/* The controls sit under the bubble, not inside it — the bubble is
              what someone said, and these are what you can do about it. */}
          <div className="mt-1 flex items-center gap-3 ps-3">
            <button
              type="button"
              onClick={() => {
                const next = !liked;
                setLiked(next);
                setLikeCount((current) => current + (next ? 1 : -1));
                setError(null);

                startTransition(async () => {
                  const result = await toggleCommentLike({
                    commentId: comment.id,
                    profileOwnerId,
                  });

                  if (!result.ok) {
                    setLiked(!next);
                    setLikeCount((current) => current + (next ? -1 : 1));
                    setError(result.error.message);
                  }
                });
              }}
              aria-pressed={liked}
              className={cn(
                'focus-visible:ring-brand/35 flex items-center gap-1 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none',
                liked ? 'text-brand' : 'text-outline hover:text-brand',
              )}
            >
              <Heart className={cn('size-3.5', liked && 'fill-current')} aria-hidden="true" />
              {likeCount > 0 ? likeCount : 'Like'}
            </button>

            {canReply ? (
              <button
                type="button"
                onClick={() => setReplying((current) => !current)}
                aria-expanded={replying}
                className="text-outline hover:text-brand focus-visible:ring-brand/35 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none"
              >
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
                    const result = await removeComment({
                      commentId: comment.id,
                      profileOwnerId,
                    });

                    if (!result.ok) {
                      setError(result.error.message);
                    }
                  });
                }}
                aria-label={`Remove ${comment.authorName}'s comment`}
                className="text-outline hover:text-destructive focus-visible:ring-brand/35 rounded-md transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <X className="size-3.5" aria-hidden="true" />
                )}
              </button>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-destructive mt-1 flex items-start gap-1.5 ps-3 text-label-sm">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}
        </div>
      </div>

      {replying ? (
        <div className="ms-9 mt-2">
          <CommentComposer
            postId={postId}
            profileOwnerId={profileOwnerId}
            parentCommentId={comment.id}
            placeholder={`Reply to ${comment.authorName.split(' ')[0]}...`}
            autoFocus
            onDone={() => setReplying(false)}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * The input for a comment or a reply.
 *
 * ONE COMPONENT FOR BOTH: a reply is a comment with a parent, so a second
 * composer would be the same markup with one hidden field changed.
 *
 * @param props - The post, an optional parent, and what to do once it lands.
 * @returns The form element.
 */
function CommentComposer({
  postId,
  profileOwnerId,
  parentCommentId,
  placeholder = 'Write a comment...',
  autoFocus = false,
  onDone,
}: {
  postId: string;
  profileOwnerId: string;
  parentCommentId?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const [state, formAction, pending] = useActionState(createComment, null);
  const [draft, setDraft] = useState('');
  const [clearedFor, setClearedFor] = useState<typeof state>(null);

  if (state?.ok === true && state !== clearedFor) {
    setClearedFor(state);
    setDraft('');
    /* Closes the reply box on success, so the thread does not keep an empty
       input open under every comment somebody has answered. */
    onDone?.();
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="profileOwnerId" value={profileOwnerId} />
      {parentCommentId ? (
        <input type="hidden" name="parentCommentId" value={parentCommentId} />
      ) : null}

      <div className="bg-field border-outline-variant/30 focus-within:border-brand focus-within:ring-brand/20 flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all focus-within:bg-white focus-within:ring-2">
        <label htmlFor={`comment-${parentCommentId ?? postId}`} className="sr-only">
          {parentCommentId ? 'Write a reply' : 'Write a comment'}
        </label>
        <input
          id={`comment-${parentCommentId ?? postId}`}
          name="body"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="text-on-surface placeholder:text-outline w-full bg-transparent text-label-md outline-none"
        />

        <button
          type="submit"
          disabled={pending || draft.trim().length === 0}
          aria-label={parentCommentId ? 'Post reply' : 'Post comment'}
          className="text-brand hover:text-brand-bright focus-visible:ring-brand/35 shrink-0 rounded-full p-1 transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {state && !state.ok ? (
        <p role="alert" className="text-destructive mt-1.5 text-label-sm">
          {state.error.message}
        </p>
      ) : null}
    </form>
  );
}
