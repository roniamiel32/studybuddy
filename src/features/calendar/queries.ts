/**
 * File:        src/features/calendar/queries.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: What the UI is allowed to know about a student's calendar
 *              connection.
 *
 *              DELIBERATELY NARROW. The connection row holds tokens; this returns
 *              a status, an email address and two timestamps. Nothing that reaches
 *              a component here could be used to call Google.
 * Version:     0.46.0
 *
 * Modifications:
 *     0.46.0 - 2026-08-18 - Initial implementation (two-way calendar sync)
 */

import 'server-only';

import { isGoogleCalendarConfigured } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient, requireUser } from '@/lib/supabase/server';

export interface CalendarStatus {
  /** False when the deployment has no Google credentials at all. */
  available: boolean;
  connected: boolean;
  syncEnabled: boolean;
  /** Which Google account, so a student with several can tell them apart. */
  accountEmail: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** How many availability rows currently come from the calendar. */
  syncedSlotCount: number;
}

/**
 * Reads the signed-in student's calendar status.
 *
 * The connection row is read with the admin client because the table has no
 * policy for `authenticated` by design — but only these fields are returned, and
 * the profile id comes from a verified session.
 *
 * @returns The status the settings and onboarding cards render from.
 */
export async function getCalendarStatus(): Promise<CalendarStatus> {
  const available = isGoogleCalendarConfigured();

  if (!available) {
    return {
      available: false,
      connected: false,
      syncEnabled: false,
      accountEmail: null,
      lastSyncedAt: null,
      lastError: null,
      syncedSlotCount: 0,
    };
  }

  const user = await requireUser();
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: connection }, { data: privateRow }, { count }] = await Promise.all([
    admin
      .from('calendar_connections')
      .select('google_email, last_synced_at, last_sync_error')
      .eq('profile_id', user.id)
      .maybeSingle(),
    supabase
      .from('profile_private')
      .select('google_calendar_sync_enabled')
      .eq('profile_id', user.id)
      .maybeSingle(),
    supabase
      .from('availability_slots')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', user.id)
      .eq('source', 'google_calendar'),
  ]);

  return {
    available: true,
    connected: Boolean(connection),
    syncEnabled: privateRow?.google_calendar_sync_enabled ?? false,
    accountEmail: connection?.google_email ?? null,
    lastSyncedAt: connection?.last_synced_at ?? null,
    lastError: connection?.last_sync_error ?? null,
    syncedSlotCount: count ?? 0,
  };
}
