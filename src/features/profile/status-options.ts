/**
 * File:        src/features/profile/status-options.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The statuses offered on the picker, and the length the free-text
 *              one is held to.
 *
 *              SEPARATE FROM THE COMPONENT so the server action can share the
 *              bound. A limit written twice is a limit that disagrees with itself
 *              eventually, and this one is also stated a third time as a CHECK on
 *              the column — the two in TypeScript at least come from one place.
 *
 *              THE PRESETS ARE HEBREW, and the rest of the interface is English.
 *              That is not an inconsistency to tidy up: these are the words a
 *              student would actually put on their own profile at an Israeli
 *              university, and translating them would produce a list nobody
 *              would pick from. It is also why every surface that renders a
 *              status sets `dir="auto"` rather than inheriting the page's
 *              direction — Hebrew in a left-to-right bubble puts the punctuation
 *              on the wrong end.
 * Version:     0.39.0
 *
 * Modifications:
 *     0.39.0 - 2026-08-17 - Initial implementation (Phase 11A)
 */

/** The longest a status may be, matching the CHECK on profiles.status_message. */
export const STATUS_MAX_LENGTH = 80;

/**
 * The ready-made statuses, in the order the picker shows them.
 *
 * Ordered roughly by how much of the term they cover: the two that describe a
 * period first, then a state of the evening, then the two about being left
 * alone — which are the pair people reach for most and read best next to each
 * other.
 */
export const STATUS_PRESETS = [
  'בתקופת מבחנים',
  'בחופשת סמסטר',
  'ישן/ה',
  'עסוק/ה',
  'בסרט',
  'נא לא להפריע',
  'נא להפריע',
] as const;

/** Placeholder for the free-text option. */
export const STATUS_PLACEHOLDER = 'Write something about yourself...';
