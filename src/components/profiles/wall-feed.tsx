/**
 * File:        src/components/profiles/wall-feed.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The social wall — the composer, and what has been written.
 *
 *              THE COMPOSER IS ABSENT RATHER THAN DISABLED when the viewer is not
 *              a connection, and the reason is stated in its place. A greyed-out
 *              box explains nothing; "you can post here once you and Maya have
 *              studied together" names the one thing that would change it, and
 *              that thing is what the product wants them to do anyway.
 * Version:     0.20.0
 *
 * Modifications:
 *     0.20.0 - 2026-08-11 - Initial implementation (Phase 8B)
 */

'use client';

import { useActionState, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertCircle, Loader2, MessageSquare, Send, Trash2 } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { createWallPost, removeWallPost } from '@/features/wall/actions';
import { postBlockedReason, type WallPostView } from '@/features/wall/wall-view';
import { timeAgo } from '@/features/notifications/notification-view';

export interface WallFeedProps {
  profileOwnerId: string;
  /** Used in the composer's prompt and in the reason it is absent. */
  firstName: string;
  isSelf: boolean;
  canPost: boolean;
  posts: WallPostView[];
}

/**
 * Renders the wall.
 *
 * @param props - Whose wall, who is looking, and what is on it.
 * @returns The section element.
 */
export function WallFeed({ profileOwnerId, firstName, isSelf, canPost, posts }: WallFeedProps) {
  const [state, formAction, posting] = useActionState(createWallPost, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState('');

  /* One success clears the box once, the same shape the chat composer uses. */
  const [clearedFor, setClearedFor] = useState<typeof state>(null);

  if (state?.ok === true && state !== clearedFor) {
    setClearedFor(state);
    setDraft('');
  }

  const error = state && !state.ok ? state.error : null;
  const blocked = postBlockedReason({ isSelf, isConnection: canPost, firstName });

  return (
    <section aria-labelledby="wall-heading" className="clay-card p-5">
      <h2 id="wall-heading" className="font-heading text-headline-md">
        {isSelf ? 'Your wall' : `${firstName}'s wall`}
      </h2>

      {canPost ? (
        <form ref={formRef} action={formAction} className="mt-4">
          <input type="hidden" name="profileOwnerId" value={profileOwnerId} />

          <label htmlFor="wall-body" className="sr-only">
            {isSelf ? 'Write on your wall' : `Write something for ${firstName}`}
          </label>

          <div className="bg-field border-outline-variant/30 focus-within:border-brand focus-within:ring-brand/20 flex items-end gap-2 rounded-2xl border px-4 py-2 transition-all focus-within:bg-white focus-within:ring-2">
            <textarea
              id="wall-body"
              name="body"
              rows={2}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={1000}
              placeholder={
                isSelf ? 'Say something...' : `Write something for ${firstName}...`
              }
              className="text-on-surface placeholder:text-outline max-h-40 w-full resize-none bg-transparent py-1 text-[15px] outline-none"
            />

            <button
              type="submit"
              disabled={posting || draft.trim().length === 0}
              aria-label="Post"
              className="bg-brand hover:bg-brand-bright focus-visible:ring-brand/35 mb-1 flex size-10 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {posting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>

          {error ? (
            <p role="alert" className="text-destructive mt-2 flex items-start gap-2 text-label-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error.message}
            </p>
          ) : null}
        </form>
      ) : (
        <p className="text-outline border-outline-variant/60 mt-4 rounded-md border border-dashed p-4 text-label-sm font-normal text-pretty">
          {blocked}
        </p>
      )}

      {posts.length === 0 ? (
        <p className="text-on-surface-variant bg-surface-container mt-4 rounded-md p-4 text-body-md text-pretty">
          {isSelf
            ? 'Nothing here yet. Anyone you have studied with can write on your wall.'
            : `Nothing on ${firstName}'s wall yet.`}
        </p>
      ) : (
        <ul aria-label="Wall posts" className="mt-4 flex flex-col gap-3">
          {posts.map((post) => (
            <WallPost key={post.id} post={post} profileOwnerId={profileOwnerId} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One post, with removal when the viewer is entitled to it.
 *
 * @param post           - The post.
 * @param profileOwnerId - Whose wall it is on.
 * @returns The list item.
 */
function WallPost({ post, profileOwnerId }: { post: WallPostView; profileOwnerId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="border-outline-variant/50 rounded-md border bg-white p-3">
      <div className="flex items-start gap-3">
        <MatchAvatar
          fullName={post.authorName}
          avatarUrl={post.authorAvatarUrl}
          size={36}
          className="border-2"
        />

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            {post.authorId ? (
              <Link
                href={`/students/${post.authorId}`}
                className="hover:text-brand text-label-md transition-colors"
              >
                {post.authorName}
              </Link>
            ) : (
              <span className="text-label-md">{post.authorName}</span>
            )}
            <span className="text-outline text-label-sm font-normal">
              {timeAgo(post.createdAt)}
            </span>
          </p>

          {/* whitespace-pre-line, so a wish written over three lines stays that
              way. Plain text throughout — no markup, no links rendered. */}
          <p className="text-on-surface mt-1 text-body-md whitespace-pre-line break-words">
            {post.body}
          </p>

          {error ? (
            <p role="alert" className="text-destructive mt-2 flex items-start gap-2 text-label-sm">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}
        </div>

        {post.canRemove ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await removeWallPost({ postId: post.id, profileOwnerId });

                if (!result.ok) {
                  setError(result.error.message);
                }
              });
            }}
            aria-label="Remove this post"
            className="text-outline hover:text-destructive focus-visible:ring-brand/35 shrink-0 rounded-md p-1 transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Trash2 className="size-4" aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
    </li>
  );
}

/** The icon the empty wall uses, exported so the page can title the section. */
export const WallIcon = MessageSquare;
