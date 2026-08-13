/**
 * File:        src/features/profile/academic-year.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: When to ask a student whether they have moved up a year.
 *
 *              THE RULE AND THE SNOOZE LIVE TOGETHER, and that is the point of
 *              this file. `last_year_prompt_date` carries two meanings — settled
 *              for this year, or postponed for a week — and it can only carry
 *              both because the postponement is written as a date the six-month
 *              rule will let through again in seven days. Put the rule in the
 *              layout and the snooze in the action and the two drift apart the
 *              first time either number changes; then "ask me later" either
 *              never comes back or comes back tomorrow.
 *
 *              PURE, so the awkward parts — a February date six months before an
 *              August one, the turn of the year — are testable without a
 *              database or a clock.
 * Version:     0.24.0
 *
 * Modifications:
 *     0.24.0 - 2026-08-13 - Initial implementation (Phase 9B)
 */

/**
 * The months the question makes sense in, as JavaScript months are numbered
 * (0 = January), so August through November.
 *
 * Asking in March is asking about a year that started six months ago and is
 * half over; by then the answer has already been wrong for two terms.
 */
export const PROMPT_FIRST_MONTH = 7;
export const PROMPT_LAST_MONTH = 10;

/** How long an answer settles the question for. */
export const REPROMPT_AFTER_MONTHS = 6;

/** How long "ask me later" puts it off for. */
export const SNOOZE_DAYS = 7;

/**
 * The ceiling the database puts on year_of_study.
 *
 * Mirrors profiles_year_of_study_check. A student already at the top cannot be
 * advanced, so they are not asked — a question whose "yes" the database would
 * refuse is not a question.
 */
export const MAX_YEAR_OF_STUDY = 8;

/**
 * Shifts a date back by whole months.
 *
 * Clamps rather than overflowing: six months before the 31st of August is the
 * 28th or 29th of February, not the 2nd or 3rd of March. Left to itself,
 * `setMonth` rolls the excess into the next month, which would make the
 * re-prompt arrive a few days late in exactly the months this feature runs in.
 *
 * @param date   - The starting point.
 * @param months - How many months to go back.
 * @returns A new Date.
 */
export function subMonths(date: Date, months: number): Date {
  const shifted = new Date(date.getTime());
  const targetDay = shifted.getDate();

  shifted.setDate(1);
  shifted.setMonth(shifted.getMonth() - months);

  const daysInTargetMonth = new Date(
    shifted.getFullYear(),
    shifted.getMonth() + 1,
    0,
  ).getDate();

  shifted.setDate(Math.min(targetDay, daysInTargetMonth));

  return shifted;
}

export interface AcademicYearPromptState {
  /** What the profile currently says, null when it was never answered. */
  yearOfStudy: number | null;
  /** When they were last asked, null when never. */
  lastPromptDate: string | null;
}

/**
 * Whether to put the question in front of this student now.
 *
 * @param state - Their year and when they were last asked.
 * @param now   - The current time; injected so this can be tested.
 * @returns True when the dialog should be shown.
 */
export function shouldPromptForAcademicYear(
  state: AcademicYearPromptState,
  now: Date = new Date(),
): boolean {
  /* Nothing to increment, or nothing left to increment to. */
  if (state.yearOfStudy === null || state.yearOfStudy >= MAX_YEAR_OF_STUDY) {
    return false;
  }

  const month = now.getMonth();

  if (month < PROMPT_FIRST_MONTH || month > PROMPT_LAST_MONTH) {
    return false;
  }

  if (state.lastPromptDate === null) {
    return true;
  }

  const lastPrompt = new Date(state.lastPromptDate);

  /* An unparseable date is treated as never asked rather than as a reason to
     stay silent forever. */
  if (Number.isNaN(lastPrompt.getTime())) {
    return true;
  }

  return lastPrompt.getTime() <= subMonths(now, REPROMPT_AFTER_MONTHS).getTime();
}

/**
 * The value to store when a student picks "ask me later".
 *
 * NOT `now`, and not a week from now — a date far enough in the past that the
 * six-month rule lets the question through again in exactly a week. The column
 * records "when we last asked", and the only lever it has over the next
 * appearance is how old it is, so a short postponement is written as an old
 * date rather than a future one.
 *
 * @param now - The current time; injected so this can be tested.
 * @returns The timestamp to write to last_year_prompt_date.
 */
export function snoozedPromptDate(now: Date = new Date()): Date {
  const reopensIn = subMonths(now, REPROMPT_AFTER_MONTHS);
  reopensIn.setDate(reopensIn.getDate() + SNOOZE_DAYS);

  return reopensIn;
}
