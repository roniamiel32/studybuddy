/**
 * File:        src/features/calendar/read-sync.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Read sync — Google's busy blocks become this app's weekly free
 *              time.
 *
 *              THE SUBTRACTION ITSELF IS IN free-time.ts AND IS PURE. This module
 *              is the plumbing around it: get a token, ask Google, write rows,
 *              record what happened.
 *
 *              IT REPLACES EVERY SLOT THE STUDENT HAS, manual ones included.
 *              That is what was asked for, and it is also the only version that
 *              is arithmetically safe: the matching engine unions a profile's
 *              slots and measures overlap in minutes, so a manual "free Monday
 *              10-12" sitting alongside a synced "free Monday 09:00-11:30" would
 *              count the shared 90 minutes twice and inflate the score. One
 *              source of truth at a time, and the calendar is it while sync is on.
 *
 *              Note what this does NOT touch: `meetings`. Booked sessions are
 *              their own table and are already treated as busy by the booking
 *              logic — writing them into availability_slots would mean the
 *              opposite of what that table records.
 * Version:     0.46.0
 *
 * Modifications:
 *     0.46.0 - 2026-08-18 - Initial implementation (two-way calendar sync)
 */

import 'server-only';

import {
  loadUsableConnection,
  markDisconnected,
  setSyncEnabled,
} from '@/features/calendar/connection';
import { computeFreeSlots, HORIZON_DAYS } from '@/features/calendar/free-time';
import { syncUpcomingMeetings } from '@/features/calendar/write-sync';
import { serverEnv } from '@/lib/env';
import { fetchBusyIntervals } from '@/lib/google/calendar';
import { createAdminClient } from '@/lib/supabase/admin';

export type SyncOutcome =
  | { ok: true; slotCount: number; timeZone: string }
  | {
      ok: false;
      reason:
        | 'not_connected'
        | 'auth_revoked'
        | 'insufficient_scope'
        | 'request_failed'
        | 'write_failed';
      message: string;
    };

/**
 * Records why a sync failed, so the card can say it.
 *
 * Best effort by design: this runs on the failure path, and a second failure
 * while writing down the first one must not replace it with a stack trace.
 *
 * @param profileId - Whose connection failed.
 * @param message   - The sentence to store.
 * @returns Nothing.
 */
async function recordSyncError(profileId: string, message: string): Promise<void> {
  try {
    await createAdminClient()
      .from('calendar_connections')
      .update({ last_sync_error: message })
      .eq('profile_id', profileId);
  } catch (error) {
    console.error('[calendar.readSync] could not record the error:', error);
  }
}

/**
 * Pulls the student's busy time and rewrites their availability from it.
 *
 * @param profileId - Whose calendar to read.
 * @returns What was written, or why nothing was.
 */
export async function runReadSync(profileId: string): Promise<SyncOutcome> {
  const connection = await loadUsableConnection(profileId);

  if (!connection) {
    return {
      ok: false,
      reason: 'not_connected',
      message: 'Your Google Calendar is not connected. Connect it to sync your free time.',
    };
  }

  const days = serverEnv().GOOGLE_CALENDAR_HORIZON_DAYS ?? HORIZON_DAYS;

  /*
   * From the start of today in the calendar's own zone rather than from "now":
   * a sync run at 19:00 would otherwise treat this morning as unobserved and
   * intersect today's weekday against a window it never actually looked at.
   */
  const rangeStart = new Date();
  rangeStart.setUTCHours(0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart.getTime() + days * 86_400_000);

  const busy = await fetchBusyIntervals(connection.accessToken, rangeStart, rangeEnd);

  if (!busy.ok) {
    if (busy.reason === 'auth_revoked') {
      const message = 'Google access was revoked. Reconnect to resume syncing.';
      await markDisconnected(profileId, message);
      return { ok: false, reason: 'auth_revoked', message };
    }

    if (busy.reason === 'insufficient_scope') {
      /*
       * Consent came back without permission to read the calendar — usually the
       * calendar scopes are missing from the Google Cloud consent screen, or the
       * student unticked one. Reconnecting is the fix, so the connection is left
       * in place and the message says what to approve.
       */
      const message =
        'Google did not grant permission to read your calendar. Disconnect, reconnect, and approve the calendar access.';
      await markDisconnected(profileId, message);
      return { ok: false, reason: 'insufficient_scope', message };
    }

    /*
     * Google's own words, kept. "We could not reach Google" is what this used to
     * say for an API that was not enabled, a quota that was exhausted, and a
     * network blip alike — three problems with three different fixes.
     */
    const message = busy.detail
      ? `Google Calendar refused the request: ${busy.detail}`
      : 'We could not reach Google Calendar just now. Try again in a moment.';

    await recordSyncError(profileId, message);

    return { ok: false, reason: 'request_failed', message };
  }

  const timeZone = connection.calendarTimezone ?? 'UTC';
  const slots = computeFreeSlots({
    busy: busy.data,
    timeZone,
    rangeStart,
    days,
  });

  const admin = createAdminClient();

  /*
   * Delete-then-insert rather than a diff. The set is small, it is entirely
   * derived, and a diff would have to reason about which rows a student edited
   * by hand in between — which, while sync owns availability, is none of them.
   */
  const { error: clearError } = await admin
    .from('availability_slots')
    .delete()
    .eq('profile_id', profileId);

  if (clearError) {
    console.error('[calendar.readSync] clearing slots failed:', clearError.message);
    await recordSyncError(profileId, `Could not update your availability: ${clearError.message}`);
    return {
      ok: false,
      reason: 'write_failed',
      message: 'We could not update your availability. Try again.',
    };
  }

  if (slots.length > 0) {
    const { error: insertError } = await admin.from('availability_slots').insert(
      slots.map((slot) => ({
        profile_id: profileId,
        day_of_week: slot.dayOfWeek,
        starts_at: slot.startsAt,
        ends_at: slot.endsAt,
        source: 'google_calendar' as const,
      })),
    );

    if (insertError) {
      console.error('[calendar.readSync] inserting slots failed:', insertError.message);
      await recordSyncError(profileId, `Could not save your availability: ${insertError.message}`);
      return {
        ok: false,
        reason: 'write_failed',
        message: 'We could not save your availability. Try again.',
      };
    }
  }

  await Promise.all([
    admin
      .from('calendar_connections')
      .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
      .eq('profile_id', profileId),
    setSyncEnabled(profileId, true),
  ]);

  /*
   * The other direction, once. A student who books three sessions and connects
   * their calendar afterwards expects to find those sessions in it — the RSVP
   * hooks only fire on future changes, so the first sync is what catches up.
   */
  await syncUpcomingMeetings(profileId);

  return { ok: true, slotCount: slots.length, timeZone };
}
