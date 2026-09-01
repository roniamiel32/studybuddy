/**
 * File:        src/features/meetings/schema.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Validation for the meeting writes. Bounds mirror the database
 *              CHECK constraints, so a rejection arrives as a message rather than
 *              a 500.
 * Version:     0.53.0
 *
 * Modifications:
 *     0.53.0 - 2026-09-01 - repeatWeekly, and the lower cap a repeating
 *                           selection is held to
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7)
 */

import { z } from 'zod';

/**
 * Exactly one scope, matching the meetings_one_scope CHECK.
 *
 * A meeting belongs to the chat it was booked from, and the two chats are
 * different tables — so "neither" and "both" are equally wrong here.
 */
const scope = z
  .object({
    conversationId: z.uuid().optional(),
    groupId: z.uuid().optional(),
  })
  .refine(
    (value) => Boolean(value.conversationId) !== Boolean(value.groupId),
    'A meeting belongs to exactly one chat.',
  );

export const meetingSlotsSchema = scope.and(
  z.object({
    /** How far ahead to look. Bounded to match the RPC's own clamp. */
    days: z.coerce.number().int().min(1).max(60).default(14),
  }),
);

/**
 * How many series one press may create.
 *
 * Lower than the twenty one-off sessions allowed below, and mirroring the cap
 * inside rpc_create_meeting_series: each of these is eight weeks of rows rather
 * than one, and refusing here turns a database error into a sentence.
 */
export const MAX_SERIES_PER_BOOKING = 5;

export const createMeetingSchema = scope.and(
  z.object({
    title: z
      .string()
      .trim()
      .min(3, 'Give the session a name of at least three characters.')
      .max(120, 'Keep the name under 120 characters.'),
    location: z.string().trim().max(200, 'Keep the place under 200 characters.').optional(),
    /*
     * One entry per session, because the picker takes more than one answer: a
     * selection of Tuesday afternoon and Thursday evening is two sessions, and
     * contiguous blocks have already been merged into one entry by the time they
     * arrive here. A single pick is simply an array of one, which is why this
     * replaced the old scalar pair rather than sitting beside it.
     */
    sessions: z
      .array(
        z.object({
          startsAt: z.iso.datetime({ offset: true }),
          endsAt: z.iso.datetime({ offset: true }),
        }),
      )
      .min(1, 'Pick at least one time.')
      /* Mirrors the cap inside rpc_create_meetings, so an absurd selection is
         refused with a sentence rather than a database error. */
      .max(20, 'That is more sessions than can be booked at once.'),

    /*
     * One checkbox in the picker. Every selected session becomes its own weekly
     * series rather than a single booking — the flag is about the selection, not
     * about one time in it.
     */
    repeatWeekly: z.boolean().default(false),
  }),
).refine(
  (value) => !value.repeatWeekly || value.sessions.length <= MAX_SERIES_PER_BOOKING,
  {
    message: `You can start ${MAX_SERIES_PER_BOOKING} repeating sessions at once. Pick fewer times, or book the rest separately.`,
    path: ['sessions'],
  },
);

export const meetingIdSchema = z.object({ meetingId: z.uuid() });

export const setRsvpSchema = z.object({
  meetingId: z.uuid(),
  going: z.boolean(),
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
