/**
 * File:        src/components/courses/tip-rating.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: One to five stars, and the average underneath.
 *
 *              A RADIO GROUP, NOT FIVE BUTTONS. Rating is picking one value out
 *              of five, which is what a radio group is; built from buttons it
 *              would announce as five unrelated controls and lose arrow-key
 *              selection, and every screen reader would read "button, button,
 *              button, button, button".
 *
 *              THE HOVER PREVIEW IS SIGHTED-ONLY SUGAR. Filling the stars up to
 *              the cursor is how everyone expects this control to behave, but it
 *              is decoration over the real state — the checked radio — so
 *              nothing depends on a pointer existing.
 *
 *              OPTIMISTIC, AND HONEST ABOUT THE AVERAGE. Your own star moves at
 *              once; the average does not, because recomputing it on the client
 *              would mean inventing a number before the server has one. It
 *              arrives on the revalidation a moment later.
 * Version:     0.25.0
 *
 * Modifications:
 *     0.25.0 - 2026-08-13 - Initial implementation (Phase 9C)
 */

'use client';

import { useState, useTransition } from 'react';
import { Star } from 'lucide-react';

import { rateCourseTip } from '@/features/course-wall/actions';
import { cn } from '@/lib/utils';

export interface TipRatingProps {
  tipId: string;
  offeringId: string;
  myStars: number | null;
  /** The label under the stars — "4.5 · 12 ratings", or "Not rated yet". */
  summary: string;
}

const STARS = [1, 2, 3, 4, 5] as const;

/**
 * Renders the rating control for one tip.
 *
 * @param props - The tip, the course, and the viewer's own rating.
 * @returns The rating element.
 */
export function TipRating({ tipId, offeringId, myStars, summary }: TipRatingProps) {
  const [selected, setSelected] = useState<number | null>(myStars);
  const [hovered, setHovered] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = hovered ?? selected ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <fieldset
        className="flex items-center gap-0.5"
        onMouseLeave={() => setHovered(null)}
        disabled={pending}
      >
        <legend className="sr-only">Rate this tip out of five</legend>

        {STARS.map((star) => (
          <label
            key={star}
            onMouseEnter={() => setHovered(star)}
            className="cursor-pointer p-0.5"
          >
            <input
              type="radio"
              name={`rating-${tipId}`}
              value={star}
              checked={selected === star}
              onChange={() => {
                const previous = selected;
                setSelected(star);
                setError(null);

                startTransition(async () => {
                  const result = await rateCourseTip({ tipId, offeringId, stars: star });

                  if (!result.ok) {
                    setSelected(previous);
                    setError(result.error.message);
                  }
                });
              }}
              className="peer sr-only"
            />
            <Star
              aria-hidden="true"
              className={cn(
                'size-5 transition-colors peer-focus-visible:ring-4 peer-focus-visible:ring-brand/35 rounded-sm',
                star <= shown ? 'fill-sunset text-sunset' : 'text-outline-variant',
              )}
            />
            <span className="sr-only">
              {star} {star === 1 ? 'star' : 'stars'}
            </span>
          </label>
        ))}
      </fieldset>

      <span className="text-outline text-label-sm font-normal">{summary}</span>

      {error ? (
        <span role="alert" className="text-destructive text-label-sm font-normal">
          {error}
        </span>
      ) : null}
    </div>
  );
}
