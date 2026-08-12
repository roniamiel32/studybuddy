/**
 * File:        src/components/profiles/wall-post-card.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: One post in the feed — header, body, action bar, comments.
 *
 *              A CARD PER POST, on a transparent column, so each one is its own
 *              object rather than a row in a list. That is the whole visual
 *              difference between a feed and a table.
 *
 *              DELETING ASKS FIRST, and asks in place. A post is somebody's
 *              words and the button sits next to Edit; a modal for it would be
 *              heavier than the action deserves, and no confirmation at all
 *              makes a mis-tap final. The tick and the cross replace the menu
 *              exactly where the menu was, so the answer is where the question
 *              was asked.
 * Version:     0.21.0
 *
 * Modifications:
 *     0.21.0 - 2026-08-12 - Initial implementation (Phase 8C)
 */

'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Check,
  Heart,
  Loader2,
  MessageCircle,
  Pencil,
  Repeat2,
  Send,
  Trash2,
  X,
} from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import {
  createComment,
  editWallPost,
  removeComment,
  removeWallPost,
  shareWallPost,
  togglePostLike,
} from '@/features/wall/actions';
import { shareAttribution, type WallPostView } from '@/features/wall/wall-view';
import { timeAgo } from '@/features/notifications/notification-view';
import { cn } from '@/lib/utils';

export interface WallPostCardProps {
  post: WallPostView;
  profileOwnerId: string;
  viewerId: string;
}

/**
 * Renders one post.
 *
 * @param props - The post, the wall it is on, and who is looking.
 * @returns The article element.
 */
export function WallPostCard({ post, profileOwnerId, viewerId }: WallPostCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showComments, setShowComments] = useState(post.comments.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /* Optimistic, because a like that waits for a round trip feels broken. The
     server is still the authority — a refusal puts it back. */
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);

  const [editState, editAction, savingEdit] = useActionState(editWallPost, null);
  const [editHandled, setEditHandled] = useState<unknown>(null);

  if (editState?.ok === true && editState !== editHandled) {
    setEditHandled(editState);
    setEditing(false);
  }

  const body = post.shared ? post.shared.body : post.body;

  return (
    <article className="rounded-xl border border-outline-variant/40 bg-white shadow-sm">
      {/* ---- Header ------------------------------------------------------- */}
      <header className="flex items-start gap-3 p-4 pb-3">
        <MatchAvatar
          fullName={post.authorName}
          avatarUrl={post.authorAvatarUrl}
          size={40}
          className="border-2"
        />

        <div className="min-w-0 flex-1">
          {post.shared ? (
            <p className="text-outline flex items-center gap-1.5 text-label-sm font-normal">
              <Repeat2 className="size-3.5" aria-hidden="true" />
              {shareAttribution(post.authorName, post.shared.ownerName)}
            </p>
          ) : null}

          <p className="text-label-md">
            {post.authorId ? (
              <Link
                href={`/students/${post.authorId}`}
                className="hover:text-brand transition-colors"
              >
                {post.authorName}
              </Link>
            ) : (
              post.authorName
            )}
          </p>

          <p className="text-outline text-label-sm font-normal">
            {timeAgo(post.createdAt)}
            {post.isEdited ? ' · edited' : null}
          </p>
        </div>

        {/* ---- Edit / delete, and the confirmation in their place --------- */}
        {post.canEdit || post.canRemove ? (
          <div className="flex shrink-0 items-center gap-1">
            {confirmingDelete ? (
              <span className="flex items-center gap-1">
                <span className="text-outline pr-1 text-label-sm">Delete this post?</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const result = await removeWallPost({ postId: post.id, profileOwnerId });

                      if (!result.ok) {
                        setError(result.error.message);
                        setConfirmingDelete(false);
                      }
                    });
                  }}
                  aria-label="Yes, delete this post"
                  className="text-destructive hover:bg-destructive/10 focus-visible:ring-brand/35 rounded-md p-1 transition-colors focus-visible:ring-4 focus-visible:outline-none"
                >
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="size-4" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  aria-label="Cancel"
                  className="text-outline hover:bg-surface-container-high focus-visible:ring-brand/35 rounded-md p-1 transition-colors focus-visible:ring-4 focus-visible:outline-none"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </span>
            ) : (
              <>
                {post.canEdit && !post.shared ? (
                  <button
                    type="button"
                    onClick={() => setEditing((current) => !current)}
                    aria-label="Edit this post"
                    className="text-outline hover:text-brand focus-visible:ring-brand/35 rounded-md p-1 transition-colors focus-visible:ring-4 focus-visible:outline-none"
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </button>
                ) : null}

                {post.canRemove ? (
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    aria-label="Delete this post"
                    className="text-outline hover:text-destructive focus-visible:ring-brand/35 rounded-md p-1 transition-colors focus-visible:ring-4 focus-visible:outline-none"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </header>

      {/* ---- Body --------------------------------------------------------- */}
      {editing ? (
        <form action={editAction} className="px-4 pb-3">
          <input type="hidden" name="postId" value={post.id} />
          <input type="hidden" name="profileOwnerId" value={profileOwnerId} />

          <label htmlFor={`edit-${post.id}`} className="sr-only">
            Edit your post
          </label>
          <textarea
            id={`edit-${post.id}`}
            name="body"
            defaultValue={post.body ?? ''}
            rows={3}
            maxLength={1000}
            className="border-outline-variant/60 focus:border-brand focus:ring-brand/20 w-full resize-none rounded-md border bg-white p-3 text-body-md outline-none focus:ring-2"
          />

          <div className="mt-2 flex items-center gap-2">
            <button
              type="submit"
              disabled={savingEdit}
              className="clay-btn-primary rounded-md px-3 py-1.5 text-label-sm"
            >
              {savingEdit ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-on-surface-variant hover:text-brand rounded-md text-label-sm transition-colors"
            >
              Cancel
            </button>
          </div>

          {editState && !editState.ok ? (
            <p role="alert" className="text-destructive mt-2 text-label-sm">
              {editState.error.message}
            </p>
          ) : null}
        </form>
      ) : (
        <div className="px-4 pb-3">
          {/* A share's own words, when it has any, sit above the quoted post. */}
          {post.shared && post.body ? (
            <p className="text-on-surface mb-3 text-body-md whitespace-pre-line break-words">
              {post.body}
            </p>
          ) : null}

          {post.shared ? (
            <blockquote className="border-outline-variant/60 bg-surface-container-low/60 rounded-md border p-3">
              <p className="text-outline mb-1 text-label-sm font-normal">
                {post.shared.authorName}
              </p>
              <p className="text-on-surface text-body-md whitespace-pre-line break-words">
                {body}
              </p>
            </blockquote>
          ) : (
            <p className="text-on-surface text-body-md whitespace-pre-line break-words">
              {body}
            </p>
          )}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-destructive flex items-start gap-2 px-4 pb-3 text-label-sm">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {/* ---- Action bar --------------------------------------------------- */}
      <div className="border-outline-variant/40 flex items-center gap-1 border-t px-2 py-1">
        <button
          type="button"
          onClick={() => {
            /* Flip first, ask after. */
            const next = !liked;
            setLiked(next);
            setLikeCount((current) => current + (next ? 1 : -1));

            startTransition(async () => {
              const result = await togglePostLike({ postId: post.id, profileOwnerId });

              if (!result.ok) {
                setLiked(!next);
                setLikeCount((current) => current + (next ? -1 : 1));
                setError(result.error.message);
              }
            });
          }}
          aria-pressed={liked}
          className={cn(
            'focus-visible:ring-brand/35 flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none',
            liked ? 'text-brand' : 'text-on-surface-variant hover:bg-surface-container-high',
          )}
        >
          <Heart className={cn('size-4', liked && 'fill-current')} aria-hidden="true" />
          Like{likeCount > 0 ? ` · ${likeCount}` : ''}
        </button>

        <button
          type="button"
          onClick={() => setShowComments((current) => !current)}
          aria-expanded={showComments}
          className="text-on-surface-variant hover:bg-surface-container-high focus-visible:ring-brand/35 flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          Comment{post.comments.length > 0 ? ` · ${post.comments.length}` : ''}
        </button>

        {/* Sharing a share is refused by the database, so it is not offered. */}
        {!post.shared && post.authorId !== viewerId ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await shareWallPost({ postId: post.id });

                if (!result.ok) {
                  setError(result.error.message);
                }
              });
            }}
            className="text-on-surface-variant hover:bg-surface-container-high focus-visible:ring-brand/35 flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
          >
            <Repeat2 className="size-4" aria-hidden="true" />
            Share
          </button>
        ) : null}
      </div>

      {/* ---- Comments ----------------------------------------------------- */}
      {showComments ? (
        <div className="border-outline-variant/40 border-t px-4 py-3">
          {post.comments.length > 0 ? (
            <ul aria-label="Comments" className="mb-3 flex flex-col gap-3">
              {post.comments.map((comment) => (
                <li key={comment.id} className="flex items-start gap-2">
                  <MatchAvatar
                    fullName={comment.authorName}
                    avatarUrl={comment.authorAvatarUrl}
                    size={28}
                    className="border"
                  />

                  <div className="bg-surface-container-low min-w-0 flex-1 rounded-2xl px-3 py-2">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-label-sm">{comment.authorName}</span>
                      <span className="text-outline text-label-sm font-normal">
                        {timeAgo(comment.createdAt)}
                      </span>
                    </p>
                    <p className="text-on-surface text-body-md whitespace-pre-line break-words">
                      {comment.body}
                    </p>
                  </div>

                  {comment.canRemove ? (
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          await removeComment({ commentId: comment.id, profileOwnerId });
                        })
                      }
                      aria-label="Remove this comment"
                      className="text-outline hover:text-destructive focus-visible:ring-brand/35 shrink-0 rounded-md p-1 transition-colors focus-visible:ring-4 focus-visible:outline-none"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <CommentComposer postId={post.id} profileOwnerId={profileOwnerId} />
        </div>
      ) : null}
    </article>
  );
}

/**
 * The small input under a post.
 *
 * @param postId         - The post being commented on.
 * @param profileOwnerId - The wall to refresh.
 * @returns The form element.
 */
function CommentComposer({
  postId,
  profileOwnerId,
}: {
  postId: string;
  profileOwnerId: string;
}) {
  const [state, formAction, pending] = useActionState(createComment, null);
  const [draft, setDraft] = useState('');
  const [clearedFor, setClearedFor] = useState<typeof state>(null);
  const formRef = useRef<HTMLFormElement>(null);

  if (state?.ok === true && state !== clearedFor) {
    setClearedFor(state);
    setDraft('');
  }

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="profileOwnerId" value={profileOwnerId} />

      <div className="bg-field border-outline-variant/30 focus-within:border-brand focus-within:ring-brand/20 flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all focus-within:bg-white focus-within:ring-2">
        <label htmlFor={`comment-${postId}`} className="sr-only">
          Write a comment
        </label>
        <input
          id={`comment-${postId}`}
          name="body"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          placeholder="Write a comment..."
          className="text-on-surface placeholder:text-outline w-full bg-transparent text-label-md outline-none"
        />

        <button
          type="submit"
          disabled={pending || draft.trim().length === 0}
          aria-label="Post comment"
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
