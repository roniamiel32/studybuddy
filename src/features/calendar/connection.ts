/**
 * File:        src/features/calendar/connection.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The stored Google connection: saving it, keeping its access token
 *              fresh, and tearing it down.
 *
 *              EVERY READ AND WRITE HERE USES THE ADMIN CLIENT, because
 *              `calendar_connections` has RLS on and no policy for
 *              `authenticated` at all. That is not a shortcut around the rules —
 *              it is the rule: a refresh token is a durable credential, nothing
 *              in the browser has a use for one, and the table is shaped so a
 *              leaked anon key cannot read it. Every function here takes the
 *              profile id from a verified session at the call site.
 * Version:     0.46.0
 *
 * Modifications:
 *     0.46.0 - 2026-08-18 - Initial implementation (two-way calendar sync)
 */

import 'server-only';

import {
  fetchAccountEmail,
  fetchCalendarTimezone,
  refreshAccessToken,
  type GoogleTokens,
} from '@/lib/google/calendar';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Refresh this far before the token actually expires.
 *
 * A token that expires during the request that used it fails in exactly the way
 * that is hardest to read in a log.
 */
const EXPIRY_SKEW_MS = 2 * 60 * 1000;

export interface StoredConnection {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  calendarTimezone: string | null;
  googleEmail: string | null;
}

/**
 * Saves a freshly granted connection.
 *
 * REFRESH TOKENS ARE NEVER OVERWRITTEN WITH NULL. Google returns one only
 * alongside a fresh consent, so a second exchange that omits it must leave the
 * stored one alone — clobbering it would leave a connection that works for an
 * hour and then dies with no way to renew itself.
 *
 * @param profileId - Whose connection this is.
 * @param tokens    - What the exchange returned.
 * @returns Nothing.
 */
export async function saveConnection(
  profileId: string,
  tokens: GoogleTokens,
): Promise<void> {
  const admin = createAdminClient();

  /* Asked for once, at connect time: both are stable, and re-reading them on
     every sync would be two extra Google calls for values that do not move. */
  const [timezone, email] = await Promise.all([
    fetchCalendarTimezone(tokens.accessToken),
    fetchAccountEmail(tokens.accessToken),
  ]);

  const row = {
    profile_id: profileId,
    provider: 'google' as const,
    access_token: tokens.accessToken,
    expires_at: tokens.expiresAt?.toISOString() ?? null,
    scope: tokens.scope,
    calendar_timezone: timezone.ok ? timezone.data : null,
    google_email: email.ok ? email.data : null,
    last_sync_error: null,
    /* Only included when present, so the upsert cannot null an existing one. */
    ...(tokens.refreshToken ? { refresh_token: tokens.refreshToken } : {}),
  };

  await admin.from('calendar_connections').upsert(row, { onConflict: 'profile_id' });
}

/**
 * Loads a connection, renewing the access token if it is due.
 *
 * @param profileId - Whose connection to load.
 * @returns The connection with a usable token, or null when there is none or it
 *          can no longer be renewed.
 */
export async function loadUsableConnection(
  profileId: string,
): Promise<StoredConnection | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from('calendar_connections')
    .select('access_token, refresh_token, expires_at, calendar_timezone, google_email')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
  const stillFresh = expiresAt !== null && expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();

  if (stillFresh) {
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      calendarTimezone: data.calendar_timezone,
      googleEmail: data.google_email,
    };
  }

  /*
   * Expired, or an expiry we never recorded. Without a refresh token there is
   * nothing to do but disconnect — the student has to grant consent again, and
   * saying so is better than retrying a dead token on every sync.
   */
  if (!data.refresh_token) {
    await markDisconnected(profileId, 'Google access expired. Reconnect to resume syncing.');
    return null;
  }

  const renewed = await refreshAccessToken(data.refresh_token);

  if (!renewed.ok) {
    if (renewed.reason === 'auth_revoked') {
      await markDisconnected(
        profileId,
        'Google access was revoked. Reconnect to resume syncing.',
      );
      return null;
    }

    /* A transient failure leaves the connection in place to try again later. */
    return null;
  }

  await admin
    .from('calendar_connections')
    .update({
      access_token: renewed.data.accessToken,
      expires_at: renewed.data.expiresAt?.toISOString() ?? null,
      /* A refresh grant does not return a new refresh token; keep the old one. */
      ...(renewed.data.refreshToken ? { refresh_token: renewed.data.refreshToken } : {}),
    })
    .eq('profile_id', profileId);

  return {
    accessToken: renewed.data.accessToken,
    refreshToken: data.refresh_token,
    expiresAt: renewed.data.expiresAt,
    calendarTimezone: data.calendar_timezone,
    googleEmail: data.google_email,
  };
}

/**
 * Turns sync off and records why, without discarding the row.
 *
 * The connection is kept so the UI can explain what happened; only the flag that
 * drives syncing is cleared.
 *
 * @param profileId - Whose connection failed.
 * @param reason    - A sentence the student can read.
 * @returns Nothing.
 */
export async function markDisconnected(profileId: string, reason: string): Promise<void> {
  const admin = createAdminClient();

  await Promise.all([
    admin.from('calendar_connections').update({ last_sync_error: reason }).eq('profile_id', profileId),
    admin
      .from('profile_private')
      .upsert(
        { profile_id: profileId, google_calendar_sync_enabled: false },
        { onConflict: 'profile_id' },
      ),
  ]);
}

/**
 * Records that sync is on.
 *
 * Upserted rather than updated: a student who never filled in a date of birth
 * has no profile_private row yet, and connecting a calendar must not depend on
 * having answered an unrelated optional question.
 *
 * @param profileId - Whose flag to set.
 * @param enabled   - Whether sync is on.
 * @returns Nothing.
 */
export async function setSyncEnabled(profileId: string, enabled: boolean): Promise<void> {
  await createAdminClient()
    .from('profile_private')
    .upsert(
      { profile_id: profileId, google_calendar_sync_enabled: enabled },
      { onConflict: 'profile_id' },
    );
}

/**
 * Removes the connection entirely.
 *
 * The calendar-derived availability rows go with it. Leaving them would mean a
 * student who disconnected still being matched on a week the app can no longer
 * verify, and they cannot edit those rows by hand — the grid only owns manual
 * ones.
 *
 * Events already written into their Google Calendar are LEFT ALONE. They are the
 * student's own data at that point, and silently deleting a fortnight of study
 * sessions from somebody's calendar because they unlinked an integration would
 * be the wrong way round.
 *
 * @param profileId - Whose connection to remove.
 * @returns Nothing.
 */
export async function removeConnection(profileId: string): Promise<void> {
  const admin = createAdminClient();

  await Promise.all([
    admin.from('calendar_connections').delete().eq('profile_id', profileId),
    admin
      .from('availability_slots')
      .delete()
      .eq('profile_id', profileId)
      .eq('source', 'google_calendar'),
    admin.from('calendar_event_links').delete().eq('profile_id', profileId),
    setSyncEnabled(profileId, false),
  ]);
}

/**
 * Hands availability back to the hand-drawn grid.
 *
 * Called when a student saves the week by hand while sync is on. Both sets of
 * rows must never coexist: the matching engine unions a profile's slots and
 * measures overlap in minutes, so a manual "free Monday 10-12" beside a synced
 * "free Monday 09:00-11:30" would count the shared 90 minutes twice and inflate
 * every score that student appears in.
 *
 * The connection row is kept. Nothing about the tokens has changed — the student
 * has simply chosen to draw their own week — and keeping it means Reconnect is a
 * single press rather than another trip through Google's consent screen.
 *
 * @param profileId - Whose sync to stand down.
 * @returns True when synced rows were actually cleared, so the caller can say so.
 */
export async function standDownCalendarSync(profileId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data: cleared } = await admin
    .from('availability_slots')
    .delete()
    .eq('profile_id', profileId)
    .eq('source', 'google_calendar')
    .select('id');

  const hadSynced = (cleared ?? []).length > 0;

  if (hadSynced) {
    await Promise.all([
      setSyncEnabled(profileId, false),
      admin
        .from('calendar_connections')
        .update({
          last_sync_error:
            'Paused: you edited your week by hand. Press Resync to go back to your calendar.',
        })
        .eq('profile_id', profileId),
    ]);
  }

  return hadSynced;
}
