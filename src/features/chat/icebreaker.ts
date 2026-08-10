/**
 * File:        src/features/chat/icebreaker.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Generating the opening message for a new conversation.
 *
 *              WHAT GOES INTO THE PROMPT is limited on purpose: first names,
 *              shared course names, and study preferences. No email, no phone
 *              number, no date of birth, no city. The model is an external
 *              service, so everything sent to it has left the building — and
 *              none of those fields would improve an icebreaker anyway.
 *
 *              WHAT COMES BACK IS UNTRUSTED TEXT. It is stored as a message and
 *              rendered as a message, never interpreted: it cannot influence an
 *              authorization decision, and it is marked `is_icebreaker` so the
 *              recipient is told it was drafted rather than typed. Design
 *              section 6.3 is the standing note on prompt injection through
 *              student-authored fields; the same reasoning applies to the reply.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3); the pure half
 *                           lives in features/chat/icebreaker-content.ts
 */

import 'server-only';

import {
  ICEBREAKER_SYSTEM_PROMPT,
  icebreakerReplySchema,
  type IcebreakerContext,
} from '@/features/chat/icebreaker-content';
import { completeJson, extractJson } from '@/lib/ai/provider';

export {
  fallbackIcebreaker,
  ICEBREAKER_SYSTEM_PROMPT,
  icebreakerReplySchema,
  sharedPreferenceNotes,
} from '@/features/chat/icebreaker-content';
export type { IcebreakerContext } from '@/features/chat/icebreaker-content';

export type IcebreakerOutcome =
  | { ok: true; message: string; model: string; latencyMs: number }
  | { ok: false; reason: 'not_configured' | 'request_failed' | 'invalid_output' };

/**
 * Writes the opener for a new conversation.
 *
 * @param context - The two students and what they have in common.
 * @returns The message, or the reason there is none.
 */
export async function generateIcebreaker(
  context: IcebreakerContext,
): Promise<IcebreakerOutcome> {
  const result = await completeJson({
    system: ICEBREAKER_SYSTEM_PROMPT,
    user: [
      `First student (the sender): ${context.senderFirstName}`,
      `Second student (the recipient): ${context.recipientFirstName}`,
      `Shared courses: ${context.sharedCourses.join(', ') || 'none recorded'}`,
      `Shared study preferences: ${context.sharedPreferences.join(', ') || 'none recorded'}`,
    ].join('\n'),
    /* Two sentences. A large budget here only buys a longer thing to truncate. */
    maxTokens: 300,
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason === 'not_configured' ? 'not_configured' : 'request_failed',
    };
  }

  const parsed = icebreakerReplySchema.safeParse(extractJson(result.text));

  if (!parsed.success) {
    console.error('[chat.icebreaker] reply failed validation:', parsed.error.issues[0]?.message);
    return { ok: false, reason: 'invalid_output' };
  }

  return {
    ok: true,
    message: parsed.data.message,
    model: result.model,
    latencyMs: result.latencyMs,
  };
}
