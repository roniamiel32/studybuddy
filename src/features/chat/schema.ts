/**
 * File:        src/features/chat/schema.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Validation for the chat's writes. The rules here are what the
 *              server actually enforces — a form can be bypassed, a schema
 *              cannot — and they mirror the database's own CHECK constraints so
 *              a rejection arrives as a message rather than a 500.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3)
 */

import { z } from 'zod';

/** Mirrors the char_length check on messages.body. */
export const MAX_MESSAGE_LENGTH = 2000;

export const sendMessageSchema = z.object({
  conversationId: z.uuid('That conversation does not exist.'),
  /*
   * Trimmed before the length check, so a message of nothing but spaces is
   * rejected rather than stored as blank. The database agrees — its constraint
   * measures btrim(body) too — and the two must not disagree about what counts
   * as empty.
   */
  body: z
    .string()
    .trim()
    .min(1, 'Write something first.')
    .max(MAX_MESSAGE_LENGTH, `Keep it under ${MAX_MESSAGE_LENGTH} characters.`),
});

export const icebreakerRequestSchema = z.object({
  partnerId: z.uuid(),
  /** The course they matched on, recorded on the conversation for the header. */
  courseOfferingId: z.uuid().optional(),
});

/**
 * The thread being cleared from a student's own Messages list.
 *
 * The kind decides which column of `hidden_threads` the id lands in, and the
 * table's CHECK constraint refuses a row that sets both or neither.
 */
export const hideThreadSchema = z.object({
  kind: z.enum(['person', 'group']),
  id: z.uuid('That conversation does not look right.'),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type IcebreakerRequest = z.infer<typeof icebreakerRequestSchema>;
