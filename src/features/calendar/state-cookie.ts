/**
 * File:        src/features/calendar/state-cookie.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The name of the OAuth state cookie, and nothing else.
 *
 *              Its own module because a server action sets it and a route handler
 *              reads it. Importing the action's module into the route would drag
 *              `'use server'` into a place that does not want it, and a hardcoded
 *              string in two files is how the two halves of a CSRF check quietly
 *              stop agreeing.
 * Version:     0.46.0
 *
 * Modifications:
 *     0.46.0 - 2026-08-18 - Initial implementation (two-way calendar sync)
 */

/** httpOnly, short-lived, and cleared by the callback whatever the outcome. */
export const CALENDAR_STATE_COOKIE = 'sb-calendar-oauth-state';

/** How long a consent round trip may take before the state is stale. */
export const CALENDAR_STATE_MAX_AGE_SECONDS = 10 * 60;
