/**
 * File:        src/lib/supabase/client.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Supabase client for use inside client components. Carries the
 *              anon key only, and every query it issues is subject to Row
 *              Level Security.
 * Version:     0.2.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Initial implementation (Phase 0.5 scaffold)
 */

import { createBrowserClient } from '@supabase/ssr';

import { clientEnv } from '@/lib/env';
import type { Database } from '@/types/database.types';

/**
 * Creates a browser Supabase client bound to the current user's session.
 *
 * Safe to call on every render: `createBrowserClient` memoises the underlying
 * instance per set of arguments, so this does not open a new connection each
 * time.
 *
 * @returns A typed Supabase client for browser use.
 * @throws Error if the public Supabase environment variables are missing.
 */
export function createClient() {
  const env = clientEnv();

  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
