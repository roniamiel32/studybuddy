/**
 * File:        src/components/profiles/wall-feed.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The social wall — a composer card, then a card per post.
 *
 *              NO SECTION HEADING AND NO SURROUNDING CARD. The column is
 *              transparent and every card is white, which is what makes a feed
 *              read as a stack of separate objects rather than as a list inside
 *              a panel. A "Your wall" title over it would frame the whole thing
 *              as one component again.
 *
 *              THE COMPOSER IS ABSENT RATHER THAN DISABLED when the viewer is not
 *              a connection, and the reason is stated in its place. A greyed-out
 *              box explains nothing; "you can post here once you and Maya have
 *              studied together" names the one thing that would change it, and
 *              that thing is what the product wants them to do anyway.
 * Version:     0.21.0
 *
 * Modifications:
 *     0.21.0 - 2026-08-12 - Feed redesign: card per post (Phase 8C)
 *     0.20.0 - 2026-08-11 - Initial implementation (Phase 8B)
 */

'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, Loader2, Send } from 'lucide-react';

import { WallPostCard } from '@/components/profiles/wall-post-card';
import { createWallPost } from '@/features/wall/actions';
import { postBlockedReason, type WallPostView } from '@/features/wall/wall-view';

export interface WallFeedProps {
  profileOwnerId: string;
  /** Used in the composer's prompt and in the reason it is absent. */
  firstName: string;
  isSelf: boolean;
  canPost: boolean;
  posts: WallPostView[];
  viewerId: string;
}

/**
 * Renders the wall.
 *
 * @param props - Whose wall, who is looking, and what is on it.
 * @returns The feed element.
 */
export function WallFeed({
  profileOwnerId,
  firstName,
  isSelf,
  canPost,
  posts,
  viewerId,
}: WallFeedProps) {
  const [state, formAction, posting] = useActionState(createWallPost, null);
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
    <section aria-label={isSelf ? 'Your wall' : `${firstName}'s wall`} className="flex flex-col gap-4">
      {/* ---- The composer, its own card ----------------------------------- */}
      {canPost ? (
        <form
          action={formAction}
          className="rounded-xl border border-outline-variant/40 bg-white p-4 shadow-sm"
        >
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
              placeholder={isSelf ? 'Say something...' : `Write something for ${firstName}...`}
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
        <p className="text-outline rounded-xl border border-dashed border-outline-variant/60 p-4 text-label-sm font-normal text-pretty">
          {blocked}
        </p>
      )}

      {/* ---- The posts, one card each ------------------------------------- */}
      {posts.length === 0 ? (
        <p className="text-on-surface-variant rounded-xl border border-outline-variant/40 bg-white p-5 text-body-md text-pretty shadow-sm">
          {isSelf
            ? 'Nothing here yet. Anyone you have studied with can write on your wall.'
            : `Nothing on ${firstName}'s wall yet.`}
        </p>
      ) : (
        posts.map((post) => (
          <WallPostCard
            key={post.id}
            post={post}
            profileOwnerId={profileOwnerId}
            viewerId={viewerId}
          />
        ))
      )}
    </section>
  );
}
