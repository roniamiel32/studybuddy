/**
 * File:        src/app/(app)/dashboard/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The matches dashboard — every classmate across the student's
 *              courses, ranked by the deterministic score in
 *              `rpc_find_candidates`.
 *
 *              Titled "Your matches" rather than the design's "AI-Powered
 *              Matches", because at this phase the ranking is entirely rule
 *              based. The AI re-rank is Phase 3b, and claiming it before it
 *              exists would be a promise the screen cannot keep.
 * Version:     0.8.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Placeholder after onboarding (Phase 1c)
 *     0.8.0 - 2026-08-05 - Replaced with the ranked matches dashboard (Phase 2)
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarPlus, Compass, Users } from 'lucide-react';

import { MatchCard } from '@/components/matching/match-card';
import { TopMatchCard } from '@/components/matching/top-match-card';
import { buttonVariants } from '@/components/ui/button';
import { getMatches } from '@/features/matching/queries';
import {
  getMyAvailability,
  getMyEnrolledOfferingIds,
  getOnboardingProfile,
} from '@/features/onboarding/queries';

export const metadata: Metadata = { title: 'Your matches' };

/**
 * Renders the matches dashboard.
 *
 * @returns The page element.
 */
export default async function MatchesPage() {
  const [profile, matches, enrolledIds, slots] = await Promise.all([
    getOnboardingProfile(),
    getMatches({ limit: 24 }),
    getMyEnrolledOfferingIds(),
    getMyAvailability(),
  ]);

  const firstName = profile.fullName?.split(' ')[0] ?? 'there';
  const [topMatch, ...others] = matches;

  return (
    <>
      <div className="mb-8">
        <h1 className="font-heading text-[28px] leading-9 text-balance sm:text-headline-lg">
          Your matches, {firstName}
        </h1>
        <p className="text-on-surface-variant mt-2 text-body-md text-pretty">
          {matches.length > 0
            ? 'Classmates in your courses, ranked by when you are both free and how you each like to study.'
            : 'We rank classmates in your courses by shared free time and study style.'}
        </p>
      </div>

      {topMatch ? <TopMatchCard match={topMatch} /> : null}

      {others.length > 0 ? (
        <section aria-labelledby="more-matches-heading" className="mt-12">
          <h2
            id="more-matches-heading"
            className="text-on-surface-variant mb-4 text-label-md tracking-wider uppercase"
          >
            More potential partners
          </h2>

          {/*
           * items-start is the fix for the expanding-card bug.
           *
           * Grid items default to `stretch`, so every card in a row was forced
           * to the height of the tallest one. Expanding "Why this match?" made
           * that card taller and dragged its neighbours' backgrounds down with
           * it, leaving them with empty space and a broken-looking row.
           *
           * Aligning to the start lets each card size to its own content, so an
           * expansion affects exactly one card. Chosen over a CSS masonry
           * layout because masonry reorders items into columns — which would
           * scramble the score ranking, and rank order is the whole point of
           * this screen.
           */}
          {/*
            NO `items-start` HERE, deliberately. It reads as a harmless default
            and is `align-items: flex-start`, which stops grid items stretching —
            so a card with one more trait chip than its neighbours was taller than
            them and its "Send message" button sat lower than theirs. Letting the
            default `stretch` apply is what squares the row up; MatchCard's
            `h-full` and `mt-auto` do the rest.
          */}
          <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {others.map((match) => (
              <MatchCard key={match.candidateId} match={match} />
            ))}
          </ul>
        </section>
      ) : null}

      {matches.length === 0 ? (
        <EmptyMatches
          hasCourses={enrolledIds.length > 0}
          hasAvailability={slots.length > 0}
        />
      ) : null}
    </>
  );
}

/**
 * Explains why there is nothing to show, and what to do about it.
 *
 * An empty screen is the moment a student decides whether the product works, so
 * it names the specific reason rather than shrugging. The two fixable causes —
 * no courses, no availability — are distinguished, because the advice differs.
 *
 * @param hasCourses      - Whether the student is enrolled in anything.
 * @param hasAvailability - Whether they have marked any free time.
 * @returns The empty state element.
 */
function EmptyMatches({
  hasCourses,
  hasAvailability,
}: {
  hasCourses: boolean;
  hasAvailability: boolean;
}) {
  return (
    <div className="clay-card flex flex-col items-center p-8 text-center sm:p-12">
      <span className="bg-brand-fixed text-brand mb-4 flex size-14 items-center justify-center rounded-full">
        <Compass className="size-7" aria-hidden="true" />
      </span>

      <h2 className="font-heading text-headline-md">No matches yet</h2>

      {!hasCourses ? (
        <>
          <p className="text-on-surface-variant mt-2 max-w-md text-body-md text-pretty">
            You are not enrolled in any courses this semester, and every match is
            anchored to a course you share.
          </p>
          <Link href="/onboarding/courses" className={`${buttonVariants({ size: 'lg' })} mt-6`}>
            <Users />
            Add your courses
          </Link>
        </>
      ) : !hasAvailability ? (
        <>
          <p className="text-on-surface-variant mt-2 max-w-md text-body-md text-pretty">
            You share courses with classmates, but you have not marked when you
            are free — overlapping hours are the biggest part of a good match.
          </p>
          <Link
            href="/onboarding/availability"
            className={`${buttonVariants({ size: 'lg' })} mt-6`}
          >
            <CalendarPlus />
            Add your free time
          </Link>
        </>
      ) : (
        <p className="text-on-surface-variant mt-2 max-w-md text-body-md text-pretty">
          Nobody else has joined your courses yet. You are early — check back
          once more of your class has signed up.
        </p>
      )}
    </div>
  );
}