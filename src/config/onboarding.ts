/**
 * File:        src/config/onboarding.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The onboarding questionnaire in one place — step order, wording
 *              and options. Keeping it here rather than inline in each page
 *              means the stepper, the pages and the validation schemas cannot
 *              disagree about how many steps there are or what they are called.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

export const ONBOARDING_STEPS = [
  { path: '/onboarding', label: 'About you' },
  { path: '/onboarding/courses', label: 'Your courses' },
  { path: '/onboarding/preferences', label: 'How you study' },
  { path: '/onboarding/availability', label: 'When you are free' },
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * Options for the multi-select preference questions.
 *
 * Every one is multi-select on purpose. A student free in the mornings *and*
 * the evenings is a good match for both, and forcing a single answer would
 * throw away the half of their availability that happened to lose the coin
 * toss.
 */
export const TIME_BLOCK_OPTIONS = [
  { value: 'morning', label: 'Morning', hint: 'Before 12:00', icon: '☀️' },
  { value: 'noon', label: 'Noon', hint: '12:00 – 17:00', icon: '🌤️' },
  { value: 'evening', label: 'Evening', hint: 'After 17:00', icon: '🌙' },
  { value: 'other', label: 'Other', hint: 'Late nights, odd hours', icon: '🦉' },
] as const;

export const ENVIRONMENT_OPTIONS = [
  {
    value: 'discussion',
    label: 'Talking & discussion',
    hint: 'Work it out loud, together',
    icon: '💬',
  },
  {
    value: 'quiet',
    label: 'Quiet study',
    hint: 'Side by side, heads down',
    icon: '🤫',
  },
] as const;

export const GROUP_SIZE_OPTIONS = [
  { value: 'small', label: 'Small', hint: 'Two or three people', icon: '👥' },
  { value: 'large', label: 'Large', hint: 'A proper study group', icon: '👨‍👩‍👧‍👦' },
] as const;

export const LANGUAGE_OPTIONS = [
  { value: 'he', label: 'Hebrew', icon: '🇮🇱' },
  { value: 'en', label: 'English', icon: '🇬🇧' },
  { value: 'ar', label: 'Arabic', icon: '🇸🇦' },
  { value: 'ru', label: 'Russian', icon: '🇷🇺' },
  { value: 'fr', label: 'French', icon: '🇫🇷' },
] as const;

/** Years of study offered in step 1. Eight covers extended degrees. */
export const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

/** Sunday-first, matching the Israeli academic week and PostgreSQL's dow. */
export const WEEKDAYS = [
  { value: 0, short: 'Sun', label: 'Sunday' },
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
  { value: 6, short: 'Sat', label: 'Saturday' },
] as const;

/**
 * Selectable hours for the availability grid, as half-open ranges.
 *
 * Two-hour blocks rather than a 24-row grid: a student picking study time
 * thinks in "Tuesday evening", not "18:00 to 18:30", and a coarser grid is far
 * less tedious on a phone.
 */
export const TIME_SLOTS = [
  { start: '08:00', end: '10:00', label: '08–10' },
  { start: '10:00', end: '12:00', label: '10–12' },
  { start: '12:00', end: '14:00', label: '12–14' },
  { start: '14:00', end: '16:00', label: '14–16' },
  { start: '16:00', end: '18:00', label: '16–18' },
  { start: '18:00', end: '20:00', label: '18–20' },
  { start: '20:00', end: '22:00', label: '20–22' },
] as const;
