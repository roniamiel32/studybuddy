/**
 * File:        src/features/chat/actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The write side of the chat: sending a message, and marking the
 *              other side's messages as read.
 *
 *              Both write as the signed-in student, so the Phase 3 policies do
 *              the authorisation. Neither action checks participation itself —
 *              that is deliberate. A hand-written check here would be a second
 *              implementation of the same rule, free to drift from the policy
 *              that actually protects the row.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3)
 */

'use server';

import { revalidatePath } from 'next/cache';

import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { createClient, requireUser } from '@/lib/supabase/server';

import { sendMessageSchema } from './schema';

/**
 * Sends a message to a conversation.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `conversationId` and `body`.
 * @returns Success, or a failure the composer can display.
 */
export async function sendMessage(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const input = sendMessageSchema.parse({
      conversationId: String(formData.get('conversationId') ?? ''),
      body: String(formData.get('body') ?? ''),
    });

    const { error } = await supabase.from('messages').insert({
      conversation_id: input.conversationId,
      sender_id: user.id,
      body: input.body,
    });

    if (error) {
      /*
       * The insert policy requires both `sender_id = auth.uid()` and
       * participation, and the client cannot tell which failed — nor should it.
       * "Not yours" is the honest summary either way.
       */
      return fail(
        ERROR_CODES.FORBIDDEN,
        'We could not send that message. The conversation may no longer be available.',
        'body',
      );
    }

    /*
     * Revalidate both screens. Realtime already updates the open chat for
     * everyone watching it, but the server-rendered Requests list and the
     * navigation badge are cached, and a student who navigates back to them
     * should not see a stale preview.
     */
    revalidatePath('/requests');
    revalidatePath(`/requests/${input.conversationId}`);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'chat.sendMessage');
  }
}

/**
 * Marks every message from the other side as read.
 *
 * Called when a conversation is opened. Scoped by `sender_id <> me` for the same
 * reason the policy is: marking your own message read would clear your badge
 * without anyone having seen anything, and would tell the other person their
 * message had been read when it had not. Already-read rows are excluded so a
 * revisit does not rewrite read_at and move the receipt time forward.
 *
 * @param conversationId - The conversation being opened.
 * @returns Success, or a failure. Silent on the UI either way.
 */
export async function markConversationRead(
  conversationId: string,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const { error } = await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('is_read', false)
      .neq('sender_id', user.id);

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, 'We could not update this conversation.');
    }

    /* The badge lives in the layout, so the whole app shell has to re-render. */
    revalidatePath('/', 'layout');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'chat.markConversationRead');
  }
}
