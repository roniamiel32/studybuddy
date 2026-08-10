/**
 * File:        src/components/matching/top-match-card.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The best candidate, given the bento treatment from the source
 *              design: large avatar, score badge, trait chips, shared
 *              availability, and the primary call to action.
 * Version:     0.18.0
 *
 * Modifications:
 *     0.18.0 - 2026-08-10 - The name links to the student's profile (Phase 6)
 *     0.12.0 - 2026-08-10 - Send message opens a conversation (Phase 3)
 *     0.10.0 - 2026-08-09 - Study track no longer shown
 *     0.8.0 - 2026-08-05 - Initial implementation (Phase 2)
 */

import Link from 'next/link';
import { Flame, Stars } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { MessageButton } from '@/components/matching/message-button';
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
          <h3 className="font-heading text-headline-md">
            <Link
              href={`/students/${match.candidateId}`}
              className="hover:text-brand focus-visible:ring-brand/35 rounded-md transition-colors focus-visible:ring-4 focus-visible:outline-none"
            >
              {match.fullName}
            </Link>
          </h3>
          <p className="text-on-surface-variant text-body-md">
            {[match.degreeName, match.yearOfStudy ? `Year ${match.yearOfStudy}` : null]
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
           * Live as of Phase 3. It opens a conversation with an opener already
           * written, which is why the label is "Send message" and not "Send
           * smart icebreaker": the opener is generated when a model is
           * configured and hand-built when one is not, and the button should not
           * promise which.
           */}
          <MessageButton
            partnerId={match.candidateId}
            courseOfferingId={match.bestCourseOfferingId}
            partnerName={match.fullName}
            tone="primary"
            className="w-full md:w-auto"
          />
        </div>
      </div>
    </section>
  );
}
