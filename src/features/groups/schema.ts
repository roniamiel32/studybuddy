/**
 * File:        src/features/groups/schema.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Validation for the study-group writes. Bounds mirror the database
 *              CHECK constraints, so a rejection arrives as a message rather than
 *              a 500.
 * Version:     0.15.0
 *
 * Modifications:
 *     0.15.0 - 2026-08-10 - Initial implementation (Phase 5)
 */

import { z } from 'zod';

import { MAX_PARTICIPANTS, MIN_PARTICIPANTS, REJECTION_REASONS } from './group-view';

export const createGroupSchema = z.object({
  courseOfferingId: z.uuid('That course does not exist.'),
  name: z
    .string()
    .trim()
    .min(3, 'Give the group a name of at least three characters.')
    .max(80, 'Keep the name under 80 characters.'),
  description: z.string().trim().max(400, 'Keep the description under 400 characters.').optional(),
  maxParticipants: z.coerce
    .number()
    .int()
    .min(MIN_PARTICIPANTS, `A group needs room for at least ${MIN_PARTICIPANTS} people.`)
    .max(MAX_PARTICIPANTS, `Keep it to ${MAX_PARTICIPANTS} people or fewer.`),
});

export const requestToJoinSchema = z.object({ groupId: z.uuid() });

export const updateGroupSchema = z.object({
  groupId: z.uuid(),
  name: z
    .string()
    .trim()
    .min(3, 'Give the group a name of at least three characters.')
    .max(80, 'Keep the name under 80 characters.'),
  description: z.string().trim().max(400, 'Keep the description under 400 characters.').optional(),
  maxParticipants: z.coerce
    .number()
    .int()
    .min(MIN_PARTICIPANTS, `A group needs room for at least ${MIN_PARTICIPANTS} people.`)
    .max(MAX_PARTICIPANTS, `Keep it to ${MAX_PARTICIPANTS} people or fewer.`),
});

export const memberRoleSchema = z.object({
  groupId: z.uuid(),
  profileId: z.uuid(),
  role: z.enum(['member', 'admin']),
});

export const removeMemberSchema = z.object({
  groupId: z.uuid(),
  profileId: z.uuid(),
});

export const inviteToGroupSchema = z.object({
  groupId: z.uuid(),
  profileId: z.uuid(),
});

export const decideInvitationSchema = z.object({
  requestId: z.uuid(),
  accept: z.boolean(),
});

export const decideRequestSchema = z
  .object({
    requestId: z.uuid(),
    decision: z.enum(['approved', 'rejected']),
    reason: z.enum(REJECTION_REASONS.map((option) => option.value) as [string, ...string[]]).optional(),
    customMessage: z.string().trim().max(500).optional(),
  })
  /*
   * A rejection has to say something. The modal always sends a reason, so this is
   * the guard against a tampered form producing a silent rejection — the student
   * would see their request disappear with no explanation at all.
   */
  .refine((input) => input.decision !== 'rejected' || Boolean(input.reason), {
    message: 'Choose a reason so we can tell them something.',
    path: ['reason'],
  })
  .refine(
    (input) =>
      input.decision !== 'rejected' ||
      input.reason !== 'other' ||
      Boolean(input.customMessage && input.customMessage.length >= 4),
    {
      message: 'Write a short message to send.',
      path: ['customMessage'],
    },
  );

export const groupMessageSchema = z.object({
  groupId: z.uuid(),
  body: z.string().trim().min(1, 'Write something first.').max(2000, 'Keep it under 2000 characters.'),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type DecideRequestInput = z.infer<typeof decideRequestSchema>;
