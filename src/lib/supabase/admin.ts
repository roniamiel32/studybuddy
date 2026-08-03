/**
 * File:        src/lib/supabase/admin.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Service-role Supabase client. BYPASSES Row Level Security
 *              entirely, so its use is restricted to the narrow set of writes
 *              listed below. Every call site must authenticate the user with
 *              `requireUser()` first and authorize the operation itself —
 *              there is no database-level safety net here.
 * Version:     0.2.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Initial implementation (Phase 0.5 scaffold)
 */

import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { clientEnv, serverEnv } from '@/lib/env';
import type { Database } from '@/types/database.types';

/**
 * The only operations permitted to use this client, per design document
 * section 1.9:
 *
 *   1. Writing `match_scores` rows from the AI re-rank route handler.
 *   2. Writing `ai_generation_log` rows for rate limiting and cost tracking.
 *   3. Seeding reference data (universities, terms, courses, offerings).
 *
 * Anything user-facing goes through `lib/supabase/server.ts` so that RLS
 * applies.
 */
export function createAdminClient() {
  const publicEnv = clientEnv();
  const secrets = serverEnv();

  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    secrets.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        /* No session to persist or refresh — this client is stateless. */
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
