/**
 * File:        src/components/courses/course-tips-feed.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The tips for a course — a composer, then a card per tip.
 *
 *              STYLED AS WALL POSTS, ORDERED AS RANKINGS. The card is the wall
 *              post card's shape on purpose: the same white card, avatar, name
 *              and body, so a tip reads as something a person wrote rather than
 *              as a row in a table. What it does not borrow is the ordering —
 *              tips arrive best-rated first, which is the one thing that makes
 *              them worth keeping separate from the wall.
 *
 *              THE ORDER IS NOT RE-SORTED HERE after a rating. The server
 *              decides the order and the revalidation brings the new one; moving
 *              a card under the cursor that just rated it would lose the reader's
 *              place to reward them for taking part.
 * Version:     0.48.0
 *
 * Modifications:
 *     0.48.0 - 2026-08-19 - Named by course name, not course code
 *     0.25.0 - 2026-08-13 - Initial implementation (Phase 9C)
 */

'use client';

import { useActionState, useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertCircle, Loader2, Send, Trash2 } from 'lucide-react';

import { TipRating } from '@/components/courses/tip-rating';
import { MatchAvatar } from '@/components/matching/match-avatar';
import { createCourseTip, removeCourseTip } from '@/features/course-wall/actions';
import { ratingSummary, type CourseTipView } from '@/features/course-wall/course-wall-view';
import { timeAgo } from '@/features/notifications/notification-view';

export interface CourseTipsFeedProps {
  offeringId: string;
  courseName: string;
  tips: CourseTipView[];
}

/**
 * Renders the tips feed.
 *
 * @param props - The course, and its tips in the order the class put them.
 * @returns The feed element.
 */
export function CourseTipsFeed({ offeringId, courseName, tips }: CourseTipsFeedProps) {
  const [state, formAction, posting] = useActionState(createCourseTip, null);
  const [draft, setDraft] = useState('');

  const [clearedFor, setClearedFor] = useState<typeof state>(null);

  if (state?.ok === true && state !== clearedFor) {
    setClearedFor(state);
    setDraft('');
  }

  const error = state && !state.ok ? state.error : null;

  return (
    <section aria-label={`${courseName} tips`} className="flex flex-col gap-4">
      <form
        action={formAction}
        className="border-outline-variant/40 rounded-xl border bg-white p-4 shadow-sm"
      >
        <input type="hidden" name="offeringId" value={offeringId} />

        <label htmlFor="tip-body" className="sr-only">
          Write a tip for {courseName}
        </label>

        <div className="bg-field border-outline-variant/30 focus-within:border-brand focus-within:ring-brand/20 flex items-end gap-2 rounded-2xl border px-4 py-2 transition-all focus-within:bg-white focus-within:ring-2">
          <textarea
            id="tip-body"
            name="body"
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1000}
            placeholder={`What should someone taking ${courseName} know?`}
            className="text-on-surface placeholder:text-outline max-h-40 w-full resize-none bg-transparent py-1 text-[15px] outline-none"
          />

          <button
            type="submit"
            disabled={posting || draft.trim().length === 0}
            aria-label="Post tip"
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

      {tips.length === 0 ? (
        <p className="text-on-surface-variant border-outline-variant/40 rounded-xl border bg-white p-5 text-body-md text-pretty shadow-sm">
          No tips for {courseName} yet. Write the first one — what you wish you had known
          in week one is usually the most useful thing here.
        </p>
      ) : (
        tips.map((tip) => <TipCard key={tip.id} tip={tip} offeringId={offeringId} />)
      )}
    </section>
  );
}

/**
 * One tip.
 *
 * @param tip        - The tip and its rating.
 * @param offeringId - The course it belongs to.
 * @returns The article element.
 */
function TipCard({ tip, offeringId }: { tip: CourseTipView; offeringId: string }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (removed) {
    return null;
  }

  return (
    <article className="border-outline-variant/40 rounded-xl border bg-white p-4 shadow-sm">
      <header className="flex items-start gap-3">
        {tip.authorId ? (
          <Link href={`/students/${tip.authorId}`} className="shrink-0">
            <MatchAvatar fullName={tip.authorName} avatarUrl={tip.authorAvatarUrl} size={40} />
          </Link>
        ) : (
          <MatchAvatar fullName={tip.authorName} avatarUrl={null} size={40} />
        )}

        <div className="min-w-0 flex-1">
          <p className="text-label-md">
            {tip.authorId ? (
              <Link href={`/students/${tip.authorId}`} className="hover:text-brand">
                {tip.authorName}
              </Link>
            ) : (
              tip.authorName
            )}
          </p>
          <p className="text-outline text-label-sm font-normal">{timeAgo(tip.createdAt)}</p>
        </div>

        {tip.canRemove ? (
          <div className="flex shrink-0 items-center gap-2">
            {confirmingDelete ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const result = await removeCourseTip({ tipId: tip.id, offeringId });

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
                aria-label="Remove this tip"
                className="text-outline hover:text-destructive transition-colors"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        ) : null}
      </header>

      <p className="text-body-md mt-3 text-pretty whitespace-pre-wrap">{tip.body}</p>

      {error ? (
        <p role="alert" className="text-destructive mt-2 flex items-start gap-2 text-label-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <div className="border-outline-variant/40 mt-3 border-t pt-3">
        <TipRating
          tipId={tip.id}
          offeringId={offeringId}
          myStars={tip.myStars}
          summary={ratingSummary(tip)}
        />
      </div>
    </article>
  );
}
