/**
 * File:        src/lib/supabase/middleware.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Session refresh helper for Next.js middleware. Supabase access
 *              tokens are short-lived; without a refresh on each request a
 *              user is silently signed out mid-session. Wired into
 *              src/middleware.ts in Phase 1c, when authenticated routes exist.
 * Version:     0.2.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Initial implementation, not yet wired up
 *                          (Phase 0.5 scaffold)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

import { clientEnv } from '@/lib/env';
import type { Database } from '@/types/database.types';

/**
 * Refreshes the Supabase session for an incoming request.
 *
 * The returned response carries any rotated auth cookies. Callers must return
 * *that* response object — building a fresh `NextResponse` instead discards
 * the refreshed cookies and signs the user out.
 *
 * @param request - The incoming middleware request.
 * @returns The response to return from middleware, the current user (null when
 *          not signed in), and the client itself so the caller can ask a
 *          follow-up question without building a second one.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = clientEnv();

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  /*
   * getUser() rather than getSession(): this call is what actually triggers the
   * token refresh, and it validates the JWT with the auth server instead of
   * trusting the cookie.
   */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user, supabase };
}
