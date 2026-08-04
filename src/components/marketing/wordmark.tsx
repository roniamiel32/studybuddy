/**
 * File:        src/components/marketing/wordmark.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The StudyBuddy wordmark. Two-tone by design — the orange half
 *              carries the same meaning the orange button does, which is where
 *              the product wants you to go next.
 * Version:     0.4.0
 *
 * Modifications:
 *     0.4.0 - 2026-08-03 - Initial implementation (design system)
 */

import { cn } from '@/lib/utils';

export interface WordmarkProps {
  className?: string;
}

/**
 * Renders the StudyBuddy wordmark as live text rather than an image, so it
 * scales, recolours and stays selectable and searchable.
 *
 * @param className - Sizing and colour overrides.
 * @returns The wordmark element.
 */
export function Wordmark({ className }: WordmarkProps) {
  return (
    <span
      className={cn('font-heading text-headline-md tracking-tight', className)}
      /* One accessible name, so screen readers announce a brand, not two words. */
      aria-label="StudyBuddy"
    >
      <span aria-hidden="true" className="text-foreground">
        Study
      </span>
      <span aria-hidden="true" className="text-sunset">
        Buddy
      </span>
    </span>
  );
}
