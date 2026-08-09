/**
 * File:        src/components/matching/top-match-card.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The best candidate, given the bento treatment from the source
 *              design: large avatar, score badge, trait chips, shared
 *              availability, and the primary call to action.
 * Version:     0.8.0
 *
 * Modifications:
 *     0.8.0 - 2026-08-05 - Initial implementation (Phase 2)
 */

import { Flame, HandHeart, Stars } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { describeScore, traitChipsFor } from '@/components/matching/traits';
import { Chip } from '@/components/ui/chip';
import { formatSharedAvailability, type MatchView } from '@/features/matching/match-view';

export interface TopMatchCardProps {
  match: MatchView;
}

/**
 * Renders the headline match.
 *
 * @param match - The highest-scoring candidate.
 * @returns The card element.
 */
export function TopMatchCard({ match }: TopMatchCardProps) {
  const chips = traitChipsFor(match, 3);
  const availability = formatSharedAvailability(match.sharedDays, match.overlapMinutes);

  return (
    <section aria-labelledby="top-match-heading">
      <h2
        id="top-match-heading"
        className="text-grape mb-4 flex items-center gap-2 text-label-md tracking-wider uppercase"
      >
        <Stars className="size-4" aria-hidden="true" />
        Top match
      </h2>

      <div className="clay-card relative flex flex-col items-start gap-6 overflow-hidden p-6 md:flex-row md:p-8">
        {/* Decorative wash, straight from the template. */}
        <div
          aria-hidden="true"
          className="bg-sunset-fixed absolute -top-10 -right-10 size-40 rounded-full opacity-50 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="bg-brand-fixed absolute bottom-0 left-20 size-32 rounded-full opacity-40 blur-2xl"
        />

        <div className="relative z-10 shrink-0 self-center md:self-start">
          <MatchAvatar
            fullName={match.fullName}
            avatarUrl={match.avatarUrl}
            size={128}
            className="size-24 md:size-32"
          />
          <span
            title={describeScore(match.score)}
            className="border-sunset-fixed text-sunset-deep absolute -bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-white px-3 py-1 text-label-sm shadow-sm"
          >
            <Flame className="size-3.5" aria-hidden="true" />
            {Math.round(match.score)}% match
          </span>
        </div>

        <div className="z-10 w-full grow">
          <h3 className="font-heading text-headline-md">{match.fullName}</h3>
          <p className="text-on-surface-variant text-body-md">
            {[match.trackName, match.yearOfStudy ? `Year ${match.yearOfStudy}` : null]
              .filter(Boolean)
              .join(' · ') || 'Classmate'}
          </p>

          <ul className="mt-3 mb-4 flex flex-wrap gap-2">
            <li>
              <Chip tone="brand" icon="📘">
                {match.bestCourseCode}
              </Chip>
            </li>
            {chips.map((chip) => (
              <li key={chip.label}>
                <Chip tone={chip.tone} icon={chip.icon}>
                  {chip.label}
                </Chip>
              </li>
            ))}
          </ul>

          <div className="bg-surface-container-low border-outline-variant/30 mb-4 rounded-lg border p-4">
            <p className="text-on-surface-variant mb-1 text-label-sm">Shared availability</p>
            <p className="text-body-md font-semibold">
              {availability ?? 'No overlapping free time yet — add more to your week'}
            </p>
            {match.sharedCourseCodes.length > 1 ? (
              <p className="text-outline mt-2 text-label-sm font-normal">
                Also together in {match.sharedCourseCodes.slice(1).join(', ')}
              </p>
            ) : null}
          </div>

          {/*
           * Disabled rather than absent. Sending a request is Phase 3a and the
           * icebreaker itself Phase 3c; showing the button conveys where this
           * screen is going, and disabling it is more honest than wiring a
           * control that silently does nothing.
           */}
          <button
            type="button"
            disabled
            aria-describedby="icebreaker-pending"
            className="clay-btn-primary flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-label-md disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
          >
            <HandHeart className="size-5" aria-hidden="true" />
            Send smart icebreaker
          </button>
          <p id="icebreaker-pending" className="text-outline mt-2 text-label-sm font-normal">
            Requests and AI icebreakers arrive in the next phase.
          </p>
        </div>
      </div>
    </section>
  );
}
