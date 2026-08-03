/**
 * File:        src/lib/supabase/server.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Supabase client for server components, server actions and route
 *              handlers. Reads the session from the request cookies and still
 *              runs under Row Level Security — it is the anon key, not the
 *              service role key.
 * Version:     0.2.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Initial implementation (Phase 0.5 scaffold)
 */

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

import { clientEnv } from '@/lib/env';
import { AppError, ERROR_CODES } from '@/lib/errors';
import type { Database } from '@/types/database.types';

/**
 * Creates a request-scoped Supabase client.
 *
 * Must be awaited because `cookies()` is asynchronous in the App Router. Never
 * cache the returned client across requests — it is bound to one request's
 * cookie jar.
 *
 * @returns A typed Supabase client bound to the current request's session.
 * @throws Error if the public Supabase environment variables are missing.
 */
export async function createClient() {
  const env = clientEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            /*
             * Server components cannot write cookies. This is expected and
             * harmless: the middleware refreshes the session on every request,
             * so a refresh dropped here is reapplied on the next navigation.
             */
          }
        },
      },
    },
  );
}

/**
 * Returns the signed-in user, or throws.
 *
 * Uses `getUser()` rather than `getSession()` on purpose: `getSession()` trusts
 * the cookie as-is, while `getUser()` validates the JWT against the Supabase
 * auth server. Authorization decisions must never be made on an unvalidated
 * token.
 *
 * @returns The authenticated Supabase user.
 * @throws AppError with code UNAUTHENTICATED when there is no valid session.
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AppError(ERROR_CODES.UNAUTHENTICATED, 'You need to sign in to do that.');
  }

  return user;
}
