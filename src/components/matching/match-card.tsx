/**
 * File:        src/components/matching/match-card.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: A candidate in the grid.
 *
 *              The source design's button says "View profile", but there is no
 *              profile route yet. Rather than ship a control that goes nowhere,
 *              it expands the card in place to show why this person was matched
 *              — which is the question a student actually has at that moment.
 * Version:     0.18.0
 *
 * Modifications:
 *     0.18.0 - 2026-08-10 - The name links to the student's profile (Phase 6)
 *     0.12.0 - 2026-08-10 - Send message button (Phase 3)
 *     0.10.0 - 2026-08-09 - Study track no longer shown
 *     0.8.0 - 2026-08-05 - Initial implementation (Phase 2)
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronDown } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { MessageButton } from '@/components/matching/message-button';
import { describeScore, traitChipsFor } from '@/components/matching/traits';
import { Chip } from '@/components/ui/chip';
import { formatSharedAvailability, type MatchView } from '@/features/matching/match-view';
import { cn } from '@/lib/utils';

export interface MatchCardProps {
  match: MatchView;
}

/**
 * Renders one candidate card.
 *
 * @param match - The candidate.
 * @returns The card element.
 */
export function MatchCard({ match }: MatchCardProps) {
  const [expanded, setExpanded] = useState(false);

  const chips = traitChipsFor(match, 2);
  const availability = formatSharedAvailability(match.sharedDays, match.overlapMinutes);
  const detailsId = `match-details-${match.candidateId}`;

  /*
   * h-full IS THE HALF THAT MAKES THE BUTTONS LINE UP. `mt-auto` on the action
   * area below can only push against space the card actually has, and a grid item
   * is only as tall as its own content unless it is told to fill the row. With
   * both, a card carrying an extra trait chip grows the row and every card in it
   * grows with it, so the buttons stay on one line.
   *
   * The grid must also not say `items-start`: that is `align-items: flex-start`,
   * which overrides the stretch this relies on. See dashboard/page.tsx.
   */
  return (
    <li className="clay-card relative flex h-full flex-col items-center p-5 text-center">
      <span
        title={describeScore(match.score)}
        className="border-brand-fixed text-brand absolute top-4 right-4 rounded-full border bg-white px-2 py-1 text-label-sm shadow-sm"
      >
        {Math.round(match.score)}%
      </span>

      <MatchAvatar
        fullName={match.fullName}
        avatarUrl={match.avatarUrl}
        size={80}
        className="mb-3 border-[3px]"
      />

      {/* The name is the way into their profile — the convention every social app
          uses, and it saves adding a second control to a card that already has two. */}
      <h3 className="text-label-md text-lg">
        <Link
          href={`/students/${match.candidateId}`}
          className="hover:text-brand focus-visible:ring-brand/35 rounded-md transition-colors focus-visible:ring-4 focus-visible:outline-none"
        >
          {match.fullName}
        </Link>
      </h3>
      <p className="text-outline mb-3 text-label-sm font-normal">
        {match.degreeName ?? 'Classmate'}
      </p>

      <ul className="mb-4 flex flex-wrap justify-center gap-1.5">
        <li>
          <Chip tone="brand">{match.bestCourseCode}</Chip>
        </li>
        {chips.map((chip) => (
          <li key={chip.label}>
            <Chip tone={chip.tone} icon={chip.icon}>
              {chip.label}
            </Chip>
          </li>
        ))}
      </ul>

      <MessageButton
        partnerId={match.candidateId}
        courseOfferingId={match.bestCourseOfferingId}
        partnerName={match.fullName}
        className="mt-auto w-full"
      />

      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls={detailsId}
        className="text-on-surface-variant hover:text-brand focus-visible:ring-brand/35 mt-2 flex w-full items-center justify-center gap-1.5 rounded-md py-1 text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none"
      >
        {expanded ? 'Hide details' : 'Why this match?'}
        <ChevronDown
          className={cn('size-4 transition-transform', expanded && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {expanded ? (
        <div
          id={detailsId}
          className="border-outline-variant/40 mt-3 w-full space-y-2 border-t pt-3 text-left"
        >
          <p className="text-on-surface-variant flex items-start gap-2 text-label-sm font-normal">
            <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {availability ?? 'No overlapping free hours yet'}
          </p>
          <p className="text-on-surface-variant text-label-sm font-normal">
            Shares {match.sharedCourseCodes.length}{' '}
            {match.sharedCourseCodes.length === 1 ? 'course' : 'courses'} with you:{' '}
            {match.sharedCourseCodes.join(', ')}
          </p>
          <p className="text-outline text-label-sm font-normal">{describeScore(match.score)}</p>
        </div>
      ) : null}
    </li>
  );
}
