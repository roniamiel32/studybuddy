/**
 * File:        src/features/calendar/actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The three things a student can do with the integration: connect,
 *              resync, and disconnect.
 *
 *              CONNECTING RETURNS A URL RATHER THAN REDIRECTING. The consent URL
 *              has to be paired with an httpOnly state cookie, and minting both
 *              in one server action is what makes the CSRF check on the callback
 *              possible — a plain link from the client could not set the cookie.
 * Version:     0.46.0
 *
 * Modifications:
 *     0.46.0 - 2026-08-18 - Initial implementation (two-way calendar sync)
 */

'use server';

import { randomUUID } from 'node:crypto';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { removeConnection } from '@/features/calendar/connection';
import { runReadSync } from '@/features/calendar/read-sync';
import {
  CALENDAR_STATE_COOKIE,
  CALENDAR_STATE_MAX_AGE_SECONDS,
} from '@/features/calendar/state-cookie';
import { isGoogleCalendarConfigured } from '@/lib/env';
import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { consentUrl } from '@/lib/google/calendar';
import { requireUser } from '@/lib/supabase/server';

/** Where the student started, so the callback can send them back there. */
const originSchema = z.enum(['settings', 'onboarding']);

/**
 * Refreshes every surface that reads availability.
 *
 * @returns Nothing.
 */
function revalidateAvailabilitySurfaces(): void {
  revalidatePath('/settings');
  revalidatePath('/onboarding/availability');
  revalidatePath('/dashboard');
}

/**
 * Starts the consent flow.
 *
 * @param input - Which screen the student pressed the button on.
 * @returns The URL to send them to, or a failure explaining why not.
 */
export async function startCalendarConnect(input: {
  origin: 'settings' | 'onboarding';
}): Promise<ActionResult<{ url: string }>> {
  try {
    await requireUser();

    if (!isGoogleCalendarConfigured()) {
      return fail(
        ERROR_CODES.UNEXPECTED,
        'Calendar syncing is not set up on this deployment yet.',
      );
    }

    const origin = originSchema.parse(input.origin);

    /*
     * The state carries the origin so the callback knows where to return to, and
     * a random half so it cannot be guessed. The cookie is the other half of the
     * check: the callback compares the two and refuses a mismatch.
     *
     * A DOT, NOT A COLON. Cookie values are percent-encoded on the way out and
     * query parameters are decoded on the way in, so a separator that needs
     * encoding makes the two halves of the comparison differ by `%3A` and the
     * check fails every single time — which looks exactly like an expired link.
     * Every character here is safe in both places.
     */
    const state = `${randomUUID()}.${origin}`;
    const url = consentUrl(state);

    if (!url) {
      return fail(ERROR_CODES.UNEXPECTED, 'Calendar syncing is not available right now.');
    }

    const jar = await cookies();
    jar.set(CALENDAR_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      /* Lax rather than strict: the browser is arriving from accounts.google.com,
         and strict would withhold the cookie on exactly that navigation. */
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: CALENDAR_STATE_MAX_AGE_SECONDS,
    });

    return ok({ url });
  } catch (error) {
    return toActionError(error, 'calendar.startCalendarConnect');
  }
}

/**
 * Re-reads the calendar and rewrites availability from it.
 *
 * @returns How many slots were written, or why none were.
 */
export async function syncCalendarNow(): Promise<ActionResult<{ slotCount: number }>> {
  try {
    const user = await requireUser();
    const outcome = await runReadSync(user.id);

    if (!outcome.ok) {
      revalidateAvailabilitySurfaces();

      return fail(
        outcome.reason === 'not_connected'
          ? ERROR_CODES.VALIDATION_FAILED
          : ERROR_CODES.UNEXPECTED,
        outcome.message,
      );
    }

    revalidateAvailabilitySurfaces();

    return ok({ slotCount: outcome.slotCount });
  } catch (error) {
    return toActionError(error, 'calendar.syncCalendarNow');
  }
}

/**
 * Unlinks the calendar.
 *
 * The calendar-derived availability goes too — see removeConnection — which
 * leaves the student with an empty week they can fill in by hand again. Saying so
 * is the card's job, not this action's.
 *
 * @returns Success, or a failure.
 */
export async function disconnectCalendar(): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    await removeConnection(user.id);

    revalidateAvailabilitySurfaces();

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'calendar.disconnectCalendar');
  }
}
