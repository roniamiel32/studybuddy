/**
 * File:        src/components/meetings/meeting-chat-card.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The inline card a booked session leaves in the chat feed, sitting
 *              among the messages at the moment somebody scheduled it.
 *
 *              THE COLOURS ARE HAND-TUNED AND LITERAL, and they are meant to be.
 *              The design arrived in Material 3's baseline token names —
 *              secondary-fixed, secondary-container, on-secondary-fixed-variant —
 *              which this project does not define; Roni then picked the card's
 *              actual palette by hand from the sunset family, as hex. That is the
 *              deliberate choice and the reason these are not tokens: the card is
 *              the one warm thing in a purple chat, which is what makes a booked
 *              session read as an event rather than another message. Do not
 *              "tidy" these back into `brand-*` classes.
 *
 *              Left literally as supplied by the design: every layout, radius,
 *              size, shadow and transition class. Dropped: `font-label-md` and
 *              `font-body-md`, which in Tailwind v4 resolve against --font-*,
 *              where this project has only `sans` and `heading` — the sizes they
 *              were reaching for are already carried by `text-label-md` and the
 *              literal `text-[13px]` beside them.
 *
 *              THE ICONS ARE LUCIDE, because Material Symbols is not loaded: the
 *              root layout pulls Nunito and Plus Jakarta and nothing else, so a
 *              `material-symbols-outlined` span renders the literal words
 *              "calendar_month" and "arrow_forward". CalendarDays and ArrowRight
 *              are the same two glyphs from the family the rest of the app uses.
 *
 *              THE WHOLE CARD IS ONE <button>. The brief asks for the card *and*
 *              the arrow to open the dialog, and a button inside a clickable
 *              parent is invalid HTML that keyboard and screen-reader users reach
 *              in two confusing steps. One button covers both targets, and the
 *              arrow keeps its circle as a decorative span — hovering anywhere on
 *              the card now grows it, which is more of the intended effect than
 *              the original could give.
 * Version:     0.29.0
 *
 * Modifications:
 *     0.29.0 - 2026-08-14 - Initial implementation (Phase 9G)
 */

'use client';

import { useState } from 'react';
import { ArrowRight, CalendarDays } from 'lucide-react';

import { MeetingDetailsDialog } from '@/components/meetings/meeting-details-dialog';
import { formatMeetingWhen, type MeetingView } from '@/features/meetings/meeting-view';

export interface MeetingChatCardProps {
  meeting: MeetingView;
}

/**
 * Renders one session's card in the message feed, and the dialog behind it.
 *
 * @param meeting - The session this card announces.
 * @returns The card element.
 */
export function MeetingChatCard({ meeting }: MeetingChatCardProps) {
  const [open, setOpen] = useState(false);

  const when = formatMeetingWhen(meeting.startsAt, meeting.endsAt);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Study session: ${meeting.title}, ${when}. Open for details.`}
        className="group bg-[#ffdbcc] border-[#fd894f]/20 focus-visible:ring-[#fd894f]/35 mt-2 flex w-full items-center justify-between rounded-2xl border p-4 text-left shadow-sm focus-visible:ring-4 focus-visible:outline-none hover:bg-[#ffd0bc] transition-colors"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="bg-[#fd894f] flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
            <CalendarDays className="text-[#6c2800] size-5" aria-hidden="true" />
          </div>

          <div className="min-w-0">
            <h4 className="text-label-md text-[#351000] truncate font-bold">
              {meeting.title}
            </h4>
            {/* Formatted in the reader's own zone, which the server does not
                share — so the first paint would otherwise be a hydration
                mismatch for anybody outside the university's timezone. */}
            <p
              suppressHydrationWarning
              className="text-[#7b2f00] text-[13px]"
            >
              {when}
              {meeting.going ? null : ' · Not attending'}
            </p>
          </div>
        </div>

        {/* A span, not a nested button: the card above is the control. */}
        <span
          aria-hidden="true"
          className="text-[#9f420a] ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm transition-transform group-hover:scale-105"
        >
          <ArrowRight className="size-5" />
        </span>
      </button>

      <MeetingDetailsDialog
        open={open}
        onClose={() => setOpen(false)}
        meeting={meeting}
      />
    </>
  );
}