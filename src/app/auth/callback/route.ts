/**
 * File:        src/app/auth/callback/route.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Where the links in our emails land.
 *
 *              A RESET LINK IS NOT A SESSION, it is a one-time code, and this is
 *              the only place that can spend it. `exchangeCodeForSession` is
 *              what turns it into the cookies the reset form then relies on, and
 *              it has to happen in a route handler because that is the only
 *              server context in Next that may actually write a cookie.
 *
 *              THE `next` PARAMETER IS TREATED AS HOSTILE. It arrives from a
 *              link in an inbox, and an open redirect on the end of an
 *              authenticated callback is how a phishing page borrows someone
 *              else's domain. Only same-origin paths are honoured.
 * Version:     0.23.0
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Initial implementation (Phase 9A)
 */

import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

/**
 * Whether a `next` value is a path on this site rather than somewhere else.
 *
 * Rejects protocol-relative URLs (`//evil.example`) as well as absolute ones:
 * both are read by the browser as another origin, and only the first looks like
 * a path.
 *
 * @param next - The requested destination.
 * @returns True when it is safe to redirect to.
 */
function isInternalPath(next: string | null): next is string {
  return Boolean(next) && next!.startsWith('/') && !next!.startsWith('//');
}

/**
 * Exchanges the emailed code for a session and forwards the student on.
 *
 * @param request - The incoming request carrying `code` and `next`.
 * @returns A redirect, always — to the destination on success, or to the login
 *          page with a message when the link is spent or expired.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = searchParams.get('next');

  const destination = isInternalPath(next) ? next : '/dashboard';

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=link-invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    /*
     * Expired, already used, or opened in a browser that never asked for it —
     * all the same to the student, who needs a new link rather than an
     * explanation of which it was.
     */
    return NextResponse.redirect(`${origin}/forgot-password?error=link-expired`);
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
