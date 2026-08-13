/**
 * File:        src/features/notifications/actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The write side of the notification feed, which is small on
 *              purpose: a student may mark their own notifications read, and
 *              nothing else.
 *
 *              There is no "create notification" action here and no INSERT policy
 *              behind one. Every notification is written by a trigger on the
 *              table where the event happened, or by rpc_sync_notifications for
 *              the derived ones — because a feed a user can write to is a feed
 *              that can lie to them.
 * Version:     0.20.0
 *
 * Modifications:
 *     0.20.0 - 2026-08-11 - Initial implementation (Phase 8A)
 */

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { createClient, requireUser } from '@/lib/supabase/server';

const markReadSchema = z.object({ notificationId: z.uuid() });

/**
 * Marks one notification as read.
 *
 * @param input - Which notification.
 * @returns Success, or a failure.
 */
export async function markNotificationRead(input: {
  notificationId: string;
}): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const parsed = markReadSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', parsed.notificationId)
      .eq('recipient_id', user.id)
      .is('read_at', null);

    if (error) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not update that.');
    }

    /* The badge lives in the layout. */
    revalidatePath('/', 'layout');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'notifications.markNotificationRead');
  }
}

/**
 * Marks everything the caller has not read as read.
 *
 * @returns Success, or a failure.
 */
export async function markAllNotificationsRead(): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', user.id)
      .is('read_at', null);

    if (error) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not update those.');
    }

    revalidatePath('/', 'layout');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'notifications.markAllNotificationsRead');
  }
}

/**
 * Dismisses one notification from the caller's feed.
 *
 * A TIMESTAMP RATHER THAN A DELETE, and the reason is rpc_sync_notifications.
 * Birthdays, strong matches, suggestions and rate-partner prompts are derived —
 * the sync rebuilds them on every visit to the feed and relies on partial unique
 * indexes plus `on conflict do nothing` to avoid duplicating them. Deleting the
 * row would take the conflicting row away with it, and the next sync would put
 * the notification straight back: an X that visibly does nothing. Dismissed rows
 * stay where those indexes can still see them.
 *
 * SCOPED BY RLS, not by this function. "You can mark your own notifications read"
 * is an UPDATE policy on `recipient_id = auth.uid()`, so a forged id updates
 * nothing rather than somebody else's feed.
 *
 * @param input - Which notification.
 * @returns Success, or a failure.
 */
export async function dismissNotification(input: {
  notificationId: string;
}): Promise<ActionResult<void>> {
  try {
    await requireUser();
    const parsed = markReadSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from('notifications')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', parsed.notificationId);

    if (error) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not dismiss that notification.');
    }

    /* The bell badge lives in the layout, so the shell has to re-render too. */
    revalidatePath('/', 'layout');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'notifications.dismissNotification');
  }
}
