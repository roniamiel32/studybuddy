/**
 * File:        src/lib/utils.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Class-name helper. Scaffolded by shadcn/ui, then extended to
 *              teach tailwind-merge about this project's custom theme scales.
 * Version:     0.4.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Added by `shadcn init` (Phase 0.5)
 *     0.4.0 - 2026-08-03 - Registered the Kinetic Learning font-size and
 *                          shadow scales with tailwind-merge
 */

import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/*
 * Without this, `cn('text-label-sm', 'text-brand')` silently drops the size.
 *
 * tailwind-merge resolves conflicts by class group, and it recognises the
 * built-in scales by name. Our theme adds custom font sizes (`text-label-sm`)
 * and custom colours (`text-brand`) that share the `text-` prefix, and with no
 * way to tell a size from a colour, it treats them as the same group and keeps
 * only the last one. The failure is invisible — no error, no warning, just type
 * that renders at the wrong size — so every custom scale has to be declared.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "headline-xl",
            "headline-lg",
            "headline-md",
            "body-lg",
            "body-md",
            "label-md",
            "label-sm",
          ],
        },
      ],
      "shadow": [
        {
          shadow: [
            "clay",
            "clay-lifted",
            "clay-btn",
            "clay-btn-pressed",
            "clay-sunset",
            "clay-soft",
            "nav",
          ],
        },
      ],
    },
  },
})

/**
 * Merges class names, resolving Tailwind conflicts left-to-right.
 *
 * @param inputs - Class values, in the usual clsx forms.
 * @returns One merged class string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
};

export type TimeSlot = {
  start: string;
  end: string;
  // את יכולה להוסיף פה עוד שדות אם המערך שלך מכיל דברים נוספים
};

/**
 * Merges consecutive time slots into unified blocks.
 * Example: ["08:00"-"10:00", "10:00"-"12:00"] -> ["08:00"-"12:00"]
 */
export function mergeConsecutiveSlots(slots: any[]) {
  if (!slots || slots.length <= 1) return slots;

  // מיון לפי startsAt
  const sortedSlots = [...slots].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const merged = [{ ...sortedSlots[0] }];

  for (let i = 1; i < sortedSlots.length; i++) {
    const currentSlot = sortedSlots[i];
    const lastMergedSlot = merged[merged.length - 1];

    // בדיקת רצף בעזרת endsAt ו-startsAt
    if (currentSlot.startsAt <= lastMergedSlot.endsAt) {
      lastMergedSlot.endsAt = currentSlot.endsAt > lastMergedSlot.endsAt ? currentSlot.endsAt : lastMergedSlot.endsAt;
    } else {
      merged.push({ ...currentSlot });
    }
  }

  return merged;
}