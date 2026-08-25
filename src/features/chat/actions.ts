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

import { hideThreadSchema, sendMessageSchema } from './schema';

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
     * everyone watching it, but the server-rendered Messages list and the
     * navigation badge are cached, and a student who navigates back to them
     * should not see a stale preview.
     */
    revalidatePath('/messages');
    revalidatePath(`/messages/${input.conversationId}`);

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


/**
 * Hides a specific message for the signed-in student.
 * 
 * Records the dismissal in the hidden_messages table so it is filtered out
 * on subsequent reads for this user only, without affecting the other participant.
 *
 * @param messageId - The ID of the message to hide.
 * @returns Success, or a failure.
 */
export async function dismissMessage(
  messageId: string,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    /* No `as any` needed since the table exists: it is in the generated types,
       so a typo in a column name is a compile error again. */
    const { error } = await supabase.from('hidden_messages').insert({
      profile_id: user.id,
      message_id: messageId,
    });

    if (error) {
      return fail(
        ERROR_CODES.UNEXPECTED,
        'We could not dismiss this message. Try again.'
      );
    }

    /* Revalidate the messages list so the hidden message disappears immediately */
    revalidatePath('/messages');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'chat.dismissMessage');
  }
}
/**
 * Clears a thread from the caller's own Messages list.
 *
 * ONE-SIDED, AND THAT IS THE WHOLE POINT. The row is keyed on (person, thread),
 * so the other participant's list, the conversation and its history are all
 * untouched. Nothing here can reach them.
 *
 * AN UPSERT, so clearing a thread that returned and was read again just moves the
 * marker forward instead of failing on the unique index.
 *
 * IT IS NOT A DELETE, and the timestamp is why: getConversations and
 * getGroupThreads compare `hidden_at` against the thread's newest message, so a
 * reply brings it back. Clearing a chat is tidying, not blocking — a version
 * that swallowed the next message would lose mail.
 *
 * @param input - Which thread, by kind.
 * @returns Success, or a failure.
 */
export async function hideThread(input: {
  kind: 'person' | 'group';
  id: string;
}): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const parsed = hideThreadSchema.parse(input);
    const supabase = await createClient();

    const target =
      parsed.kind === 'person'
        ? { conversation_id: parsed.id, group_id: null }
        : { conversation_id: null, group_id: parsed.id };

    const { error } = await supabase.from('hidden_threads').upsert(
      { profile_id: user.id, ...target, hidden_at: new Date().toISOString() },
      {
        /* Matches the partial unique index for the kind being hidden — the other
           column is null, and null is not what those indexes key on. */
        onConflict: parsed.kind === 'person' ? 'profile_id,conversation_id' : 'profile_id,group_id',
      },
    );

    if (error) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not clear that conversation.');
    }

    /* The unread badge in the layout counts threads, so the shell re-renders. */
    revalidatePath('/', 'layout');
    revalidatePath('/messages');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'chat.hideThread');
  }
}
