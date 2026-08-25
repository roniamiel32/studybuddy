/**
 * File:        src/app/api/auth/google-calendar/callback/route.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Where Google sends the student back after they grant consent.
 *
 *              A route handler because two things here can only happen in one:
 *              spending a one-time code, and reading the state cookie that proves
 *              this redirect belongs to a request we started.
 *
 *              THE STATE CHECK IS THE SECURITY OF THIS ENDPOINT. Without it,
 *              anyone could hand a signed-in student a link to this URL carrying
 *              an authorization code for THEIR OWN Google account, and the
 *              student's profile would end up syncing a stranger's calendar —
 *              login CSRF, with someone else's diary as the payload. The state is
 *              minted when the consent URL is built, stored in an httpOnly
 *              cookie, and has to come back identical.
 *
 *              THE CODE IS NEVER LOGGED AND NEVER REDIRECTED WITH. It is a
 *              credential for the length of one exchange, and query strings end
 *              up in access logs and browser history.
 * Version:     0.46.0
 *
 * Modifications:
 *     0.46.0 - 2026-08-18 - Initial implementation (two-way calendar sync)
 */

import { NextResponse, type NextRequest } from 'next/server';

import { saveConnection } from '@/features/calendar/connection';
import { runReadSync } from '@/features/calendar/read-sync';
import { CALENDAR_STATE_COOKIE } from '@/features/calendar/state-cookie';
import { exchangeCode } from '@/lib/google/calendar';
import { createClient } from '@/lib/supabase/server';

/** Where the student lands afterwards, with a status the page turns into a toast. */
const SETTINGS = '/settings';
const ONBOARDING = '/onboarding/availability';

/**
 * Builds the redirect back into the app.
 *
 * @param request - The incoming request, for its origin.
 * @param to      - Path to land on.
 * @param status  - Short machine-readable outcome, read by the landing page.
 * @returns The redirect response.
 */
function back(request: NextRequest, to: string, status: string): NextResponse {
  const url = new URL(to, request.nextUrl.origin);
  url.searchParams.set('calendar', status);
  return NextResponse.redirect(url);
}

/**
 * Completes the OAuth handshake and runs the first sync.
 *
 * @param request - Carries `code`, `state` and possibly `error`.
 * @returns A redirect, always.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  /*
   * Read and clear the state cookie before anything else, so a failed attempt
   * cannot leave a valid state lying around to be replayed.
   */
  const rawCookieState = request.cookies.get(CALENDAR_STATE_COOKIE)?.value ?? null;
  /*
   * Decoded defensively. The state is built from URL-safe characters precisely so
   * this is a no-op today (see startCalendarConnect), but a cookie value that
   * arrives encoded and a query parameter that arrives decoded would otherwise
   * never compare equal, and the failure looks like an expired link rather than a
   * bug.
   */
  const cookieState = rawCookieState ? decodeURIComponent(rawCookieState) : null;
  const returnedState = searchParams.get('state');
  const [, origin = 'settings'] = (cookieState ?? '').split('.');
  const destination = origin === 'onboarding' ? ONBOARDING : SETTINGS;

  /**
   * Attaches the cookie deletion to whatever response we send.
   *
   * @param response - The redirect being returned.
   * @returns The same response, with the state cookie cleared.
   */
  const clearing = (response: NextResponse) => {
    response.cookies.delete(CALENDAR_STATE_COOKIE);
    return response;
  };

  /* The student pressed "Deny", or Google refused. Not an error worth alarming
     anyone about — they opted out of an opt-in feature. */
  if (searchParams.get('error')) {
    return clearing(back(request, destination, 'denied'));
  }

  const code = searchParams.get('code');

  if (!code || !returnedState || !cookieState || returnedState !== cookieState) {
    return clearing(back(request, destination, 'invalid'));
  }

  /*
   * The session is checked AFTER the state, and separately: the state proves the
   * request was started here, and this proves it is still the same signed-in
   * student finishing it.
   */
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return clearing(back(request, '/login', 'signed-out'));
  }

  const tokens = await exchangeCode(code);

  if (!tokens.ok) {
    return clearing(back(request, destination, 'exchange-failed'));
  }

  /*
   * A consent without a refresh token is not rejected here. `prompt=consent` asks
   * for one every time, and when Google withholds it anyway the cause is that we
   * already hold one for this account — which saveConnection deliberately keeps
   * rather than overwriting. If there genuinely is none, the sync below is what
   * discovers it, and it reports the failure in words the student can act on.
   */
  const saved = await saveConnection(user.id, tokens.data);

  /*
   * Reported separately from a sync failure. These are different problems with
   * different fixes — one is our database, the other is Google — and collapsing
   * them into one message is what sent the first real bug report looking at the
   * calendar API when the row had never been written at all.
   */
  if (!saved) {
    return clearing(back(request, destination, 'connect-failed'));
  }

  /*
   * The first sync runs here rather than being left to the student. Connecting a
   * calendar and then seeing no availability appear reads as a broken feature,
   * and the sync is the entire reason they connected it.
   */
  const synced = await runReadSync(user.id);

  return clearing(
    back(request, destination, synced.ok ? `synced-${synced.slotCount}` : 'sync-failed'),
  );
}
