/**
 * File:        src/components/courses/course-wall-feed.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The course wall — a composer card, then a card per post.
 *
 *              NO SECTION HEADING AND NO SURROUNDING CARD, matching the profile
 *              wall: the column is transparent and every card is white, which is
 *              what makes a feed read as a stack of separate objects rather than
 *              a list inside a panel.
 *
 *              NO "YOU CANNOT POST" STATE. On a profile the composer is absent
 *              for a stranger, with the rule stated in its place; here there is
 *              nobody to state a rule to. A student who is not enrolled cannot
 *              reach this page at all — getMyCourse 404s first — so the composer
 *              is unconditional and the enrolment check stays where it belongs,
 *              in RLS.
 * Version:     0.25.0
 *
 * Modifications:
 *     0.25.0 - 2026-08-13 - Initial implementation (Phase 9C)
 */

'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, Loader2, Send } from 'lucide-react';

import { CoursePostCard } from '@/components/courses/course-post-card';
import { createCoursePost } from '@/features/course-wall/actions';
import type { WallPostView } from '@/features/wall/wall-view';

export interface CourseWallFeedProps {
  offeringId: string;
  courseCode: string;
  posts: WallPostView[];
}

/**
 * Renders the course wall.
 *
 * @param props - The course, and what is on its wall.
 * @returns The feed element.
 */
export function CourseWallFeed({ offeringId, courseCode, posts }: CourseWallFeedProps) {
  const [state, formAction, posting] = useActionState(createCoursePost, null);
  const [draft, setDraft] = useState('');

  const [clearedFor, setClearedFor] = useState<typeof state>(null);

  if (state?.ok === true && state !== clearedFor) {
    setClearedFor(state);
    setDraft('');
  }

  const error = state && !state.ok ? state.error : null;

  return (
    <section aria-label={`${courseCode} wall`} className="flex flex-col gap-4">
      <form
        action={formAction}
        className="border-outline-variant/40 rounded-xl border bg-white p-4 shadow-sm"
      >
        <input type="hidden" name="offeringId" value={offeringId} />

        <label htmlFor="course-wall-body" className="sr-only">
          Write something for {courseCode}
        </label>

        <div className="bg-field border-outline-variant/30 focus-within:border-brand focus-within:ring-brand/20 flex items-end gap-2 rounded-2xl border px-4 py-2 transition-all focus-within:bg-white focus-within:ring-2">
          <textarea
            id="course-wall-body"
            name="body"
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={1000}
            placeholder={`Ask the class about ${courseCode}...`}
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

      {posts.length === 0 ? (
        <p className="text-on-surface-variant border-outline-variant/40 rounded-xl border bg-white p-5 text-body-md text-pretty shadow-sm">
          Nothing here yet. Ask a question about {courseCode} and whoever is taking it
          will see it.
        </p>
      ) : (
        posts.map((post) => (
          <CoursePostCard key={post.id} post={post} offeringId={offeringId} />
        ))
      )}
    </section>
  );
}
