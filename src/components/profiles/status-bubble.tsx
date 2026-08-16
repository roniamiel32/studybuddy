/**
 * File:        src/components/profiles/status-bubble.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The line a student has put about themselves, floating above their
 *              avatar with a tail pointing down at it.
 *
 *              THE TAIL IS A THOUGHT TRAIL, made of two small circles of
 *              decreasing size to look like a comic book thought bubble.
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
 * Version:     0.39.5
 *
 * Modifications:
 *     0.39.5 - 2026-08-17 - Pushed bubble further top-right, stretched trail back to avatar
 *     0.39.4 - 2026-08-17 - Moved bubble to the top-right with a diagonal thought trail
 *     0.39.3 - 2026-08-17 - Changed tail to a thought bubble trail
 *     0.39.2 - 2026-08-17 - Updated to white bubble with drop-shadow
 *     0.39.1 - 2026-08-17 - Updated to iOS-style translucent bubble 
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
        // Pushed further up and out from the avatar center
        'pointer-events-none absolute bottom-[85%] left-[85%] z-10 drop-shadow-md',
        'max-w-[16rem]',
        className,
      )}
    >
      <span
        dir="auto"
        className={cn(
          'relative z-10 block truncate whitespace-nowrap',
          'bg-white text-gray-800 px-5 py-2.5 rounded-[20px] text-sm font-medium',
          interactive && 'transition-colors group-hover/status:bg-gray-50',
        )}
      >
        {status}
      </span>

      {/* Thought bubble trail - Medium circle (bottom-left area of the bubble) */}
      <span
        aria-hidden="true"
        className="absolute -bottom-1.5 left-3 z-0 size-2.5 rounded-full bg-white"
      />
      
      {/* Thought bubble trail - Small circle (stretching back to touch the avatar) */}
      <span
        aria-hidden="true"
        className="absolute -bottom-4 left-0 z-0 size-1.5 rounded-full bg-white"
      />
    </span>
  );
}