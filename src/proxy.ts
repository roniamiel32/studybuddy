/**
 * File:        src/proxy.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Session refresh and route guarding.
 *
 *              This is a convenience layer, not the security boundary. Supabase
 *              access tokens are short-lived, so without a refresh here a
 *              student is silently signed out mid-session; and sending someone
 *              to the right page beats showing them an error. The actual
 *              enforcement is Row Level Security — every query a signed-out or
 *              wrong-tenant user could make returns nothing regardless of what
 *              this file decides.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import { NextResponse, type NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/middleware';

/** Pages that only make sense when signed out. */
const CREDENTIAL_ROUTES = ['/login', '/signup'];

/**
 * Routes the middleware runs on.
 *
 * The public landing page is deliberately excluded. It needs no session, and
 * excluding it means the marketing page still renders on a checkout with no
 * Supabase configured — which is also what keeps the landing e2e test running
 * without a database.
 */
export const config = {
  matcher: [
    '/login',
    '/signup',
    '/onboarding/:path*',
    '/dashboard/:path*',
    '/courses/:path*',
    '/messages/:path*',
    '/groups/:path*',
    '/students/:path*',
    '/partners/:path*',
    '/settings/:path*',
  ],
};

/**
 * Refreshes the session and routes the request to the page that fits the
 * student's current state.
 *
 * @param request - The incoming request.
 * @returns A redirect, or the session-refreshed response.
 */
export async function proxy(request: NextRequest) {
  const { response, user, supabase } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isCredentialRoute = CREDENTIAL_ROUTES.includes(pathname);
  const isOnboarding = pathname.startsWith('/onboarding');

  /* Signed out: credential pages are fine, everything else is not. */
  if (!user) {
    if (isCredentialRoute) {
      return response;
    }

    const login = request.nextUrl.clone();
    login.pathname = '/login';
    // Remember where they were headed, so signing in resumes it rather than
    // dumping them on the dashboard.
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  /*
   * One extra query per guarded request. Acceptable at this scale, and the
   * honest option: onboarding state lives in the database, and mirroring it
   * into the JWT would mean it could be stale exactly when it matters. If this
   * ever shows up in latency, the fix is a claim refreshed on completion.
   */
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', user.id)
    .maybeSingle();

  const hasFinishedOnboarding = Boolean(profile?.onboarding_completed_at);

  if (isCredentialRoute) {
    const destination = request.nextUrl.clone();
    destination.pathname = hasFinishedOnboarding ? '/dashboard' : '/onboarding';
    destination.search = '';
    return NextResponse.redirect(destination);
  }

  /* Half-finished students belong in onboarding, wherever they aimed. */
  if (!hasFinishedOnboarding && !isOnboarding) {
    const onboarding = request.nextUrl.clone();
    onboarding.pathname = '/onboarding';
    onboarding.search = '';
    return NextResponse.redirect(onboarding);
  }

  /* Finished students have no reason to revisit onboarding. */
  if (hasFinishedOnboarding && isOnboarding) {
    const dashboard = request.nextUrl.clone();
    dashboard.pathname = '/dashboard';
    dashboard.search = '';
    return NextResponse.redirect(dashboard);
  }

  return response;
}
