/**
 * File:        src/lib/supabase/credential-check.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Verifying a password without signing anybody in or out.
 *
 *              WHY THIS CANNOT USE THE REQUEST CLIENT. signInWithPassword
 *              writes auth cookies on success and clears them on failure, so
 *              asking the request-scoped client "is this the right password?"
 *              answers the question and rewrites the session of the student who
 *              asked. Getting their current password wrong would sign them out
 *              of the settings page they were standing on.
 *
 *              WHY IT CANNOT USE THE ADMIN CLIENT EITHER. The service role key
 *              is for bypassing RLS on writes we have already authorized; a
 *              password check is a plain anon-key operation and borrowing the
 *              service role for it would put the most dangerous key in the
 *              codebase on the most guessable input in the app.
 * Version:     0.23.0
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Initial implementation (Phase 9A)
 */

import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { clientEnv } from '@/lib/env';

/**
 * Checks an email and password against the auth server.
 *
 * The session it creates is thrown away with the client — nothing is persisted
 * and no cookie is written.
 *
 * @param email    - The account's address.
 * @param password - The password to test.
 * @returns True when the pair is correct.
 */
export async function isCurrentPassword(email: string, password: string): Promise<boolean> {
  const env = clientEnv();

  const isolated = createSupabaseClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { error } = await isolated.auth.signInWithPassword({ email, password });

  /*
   * scope: 'local', and it MUST be. signOut() defaults to 'global', which
   * revokes every refresh token the user has — including the session cookie
   * belonging to the student who is standing on the settings page asking this
   * question. The next call they make is then rejected, and a correct password
   * comes back as "something went wrong".
   *
   * Local leaves this check's own refresh token alive until it expires. It is
   * never written down, never leaves this function, and that is a smaller price
   * than signing someone out of their own password change.
   */
  if (!error) {
    await isolated.auth.signOut({ scope: 'local' });
  }

  return !error;
}
