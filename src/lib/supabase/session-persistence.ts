/**
 * File:        src/lib/supabase/session-persistence.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: How long the auth cookies live, which is the whole of "keep me
 *              signed in".
 *
 *              THE CHOICE IS A COOKIE, not a session flag, and it has to be:
 *              the thing it controls is the lifetime of the session cookies
 *              themselves, so it cannot be stored inside the session it decides
 *              the fate of. It is read on every request that rotates a token —
 *              middleware included — long after the login form is gone.
 *
 *              UNCHECKED MEANS A SESSION COOKIE: no Max-Age and no Expires, so
 *              the browser drops it when it closes. Checked means the lifetime
 *              @supabase/ssr already asked for, which follows the refresh token.
 *              Neither setting shortens the token's life on the server — a
 *              cookie is the only part of this the browser obeys, and pretending
 *              otherwise would be security theatre.
 * Version:     0.23.0
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Initial implementation (Phase 9A)
 */

import type { CookieOptions } from '@supabase/ssr';

/**
 * Name of the cookie recording the student's choice.
 *
 * Deliberately not prefixed `sb-`: everything with that prefix belongs to
 * @supabase/ssr, which enumerates its own cookies and would be entitled to
 * treat a stray one as a corrupted chunk of a session.
 */
export const REMEMBER_COOKIE = 'studybuddy-remember-me';

/**
 * How long the choice itself is remembered: a year, so that the next visit from
 * this browser starts from the same answer the student last gave.
 */
export const REMEMBER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Strips the lifetime from a cookie so the browser treats it as a session
 * cookie, unless the student asked to stay signed in.
 *
 * @param options  - The options @supabase/ssr wants to set the cookie with.
 * @param remember - Whether the student ticked "keep me signed in".
 * @returns The options to actually use.
 */
export function withSessionPersistence(
  options: CookieOptions,
  remember: boolean,
): CookieOptions {
  if (remember) {
    return options;
  }

  /*
   * Both have to go. Either one alone still pins the cookie to a date, and a
   * cookie with an Expires in the future outlives the browser window no matter
   * what Max-Age says.
   */
  const sessionScoped = { ...options };
  delete sessionScoped.maxAge;
  delete sessionScoped.expires;

  return sessionScoped;
}

/**
 * Reads the choice out of whatever cookie jar the caller has.
 *
 * Defaults to true. The default only applies before the first sign-in of a
 * browser, and staying signed in is both the common preference and what this
 * app did before the checkbox existed — defaulting the other way would sign
 * everyone out on upgrade for a setting they never touched.
 *
 * @param get - Reads a cookie by name.
 * @returns Whether to persist the session past the browser closing.
 */
export function readRememberChoice(
  get: (name: string) => { value: string } | undefined,
): boolean {
  return get(REMEMBER_COOKIE)?.value !== 'false';
}
