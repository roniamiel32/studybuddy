/**
 * File:        src/components/profiles/status-bubble.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The line a student has put about themselves, floating above their
 *              avatar with a tail pointing down at it.
 *
 *              THE TAIL IS A ROTATED SQUARE, not a border triangle and not an
 *              SVG. A border triangle needs the colour written a second time in
 *              `border-top-color`, which then has to be kept in step with the
 *              bubble by hand; a square sharing the bubble's own background
 *              cannot drift from it. Half of it is tucked behind the bubble so
 *              only the point shows.
 *
 *              IT IS ABSOLUTELY POSITIONED AND POINTER-TRANSPARENT. The bubble
 *              hangs over the profile banner from a wrapper the avatar sits in,
 *              so it must not take the avatar's clicks — on somebody else's
 *              profile the avatar is a link, and a bubble in front of it would
 *              swallow the press.
 *
 *              dir="auto" IS LOAD-BEARING. Every preset is Hebrew and the app is
 *              otherwise left-to-right; without it "נא לא להפריע" renders with
 *              its punctuation on the wrong end, and a mixed status reads as
 *              nonsense. The browser picks the direction from the first strong
 *              character, which is exactly the rule wanted here.
 * Version:     0.39.0
 *
 * Modifications:
 *     0.39.0 - 2026-08-17 - Initial implementation (Phase 11A)
 */

import { cn } from '@/lib/utils';

export interface StatusBubbleProps {
  status: string;
  /** Adds the affordance that it can be pressed, on the owner's own profile. */
  interactive?: boolean;
  className?: string;
}

/**
 * Renders the speech bubble.
 *
 * @returns The bubble, tail included.
 */
export function StatusBubble({ status, interactive = false, className }: StatusBubbleProps) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2',
        'max-w-[14rem] whitespace-nowrap',
        className,
      )}
    >
      <span
        dir="auto"
        className={cn(
          'bg-inverse-surface text-inverse-on-surface relative block truncate rounded-full',
          'px-3 py-1 text-[13px] leading-tight shadow-clay-soft',
          interactive && 'transition-colors group-hover/status:brightness-125',
        )}
      >
        {status}
      </span>

      {/* Half behind the bubble, so only the point is visible. */}
      <span
        aria-hidden="true"
        className="bg-inverse-surface absolute -bottom-1 left-1/2 size-3 -translate-x-1/2 rotate-45 rounded-[2px]"
      />
    </span>
  );
}
