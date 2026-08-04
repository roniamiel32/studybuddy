/**
 * File:        src/components/ui/chip.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Pill-shaped labels for learning traits, courses and match
 *              signals — "Early Bird", "Night Owl", "CS-3040". The design
 *              system distinguishes chips from buttons by shape alone: chips
 *              are fully round, buttons are 12px. Keeping that rule absolute is
 *              what stops students trying to tap a label.
 * Version:     0.4.0
 *
 * Modifications:
 *     0.4.0 - 2026-08-03 - Initial implementation (design system)
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/*
 * Tones split into two groups, and the split is deliberate.
 *
 * The three brand tones carry their own text colour because they are saying
 * something about the product — a course, a match, a StudyBuddy concept. The
 * four neutral pastels exist only to let a row of traits stay visually
 * distinct, so they all share `on-surface-variant` for text. Giving each of
 * them a bespoke text colour would have meant inventing four more hexes for
 * no gain in meaning, and would have quietly made the palette twice as big.
 */
const chipVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-3 py-1 text-label-sm whitespace-nowrap',
  {
    variants: {
      tone: {
        brand: 'bg-[#f2f0ff] text-brand',
        sunset: 'bg-sunset-fixed text-sunset-deep',
        grape: 'bg-grape-fixed text-grape',
        mint: 'bg-[#ebf6ec] text-on-surface-variant',
        sky: 'bg-[#ebf4f6] text-on-surface-variant',
        sand: 'bg-[#f6f4eb] text-on-surface-variant',
        rose: 'bg-[#f6ebf0] text-on-surface-variant',
        neutral: 'bg-surface-container text-on-surface-variant',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  },
);

export interface ChipProps
  extends React.ComponentProps<'span'>,
    VariantProps<typeof chipVariants> {
  /**
   * Leading emoji or icon. Decorative by definition — the chip's text already
   * says what it means — so it is hidden from assistive technology.
   */
  icon?: React.ReactNode;
}

/**
 * Renders a trait or metadata chip.
 *
 * @param tone      - Colour family; see the note above on the two groups.
 * @param icon      - Optional decorative leading glyph.
 * @param className - Additional classes.
 * @param children  - The chip's label.
 * @returns The chip element.
 */
function Chip({ className, tone, icon, children, ...props }: ChipProps) {
  return (
    <span data-slot="chip" className={cn(chipVariants({ tone, className }))} {...props}>
      {icon ? (
        <span aria-hidden="true" className="text-[0.9em] leading-none">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}

export { Chip, chipVariants };
