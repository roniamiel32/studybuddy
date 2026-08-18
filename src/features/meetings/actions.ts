/**
 * File:        src/features/meetings/actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The write side of scheduling, plus the read the picker needs.
 *
 *              EVERY WRITE GOES THROUGH AN RPC, because every write is more than
 *              one row. Booking is a meeting plus one attendee each; the database
 *              does it in one transaction under an advisory lock per participant,
 *              so two people booking the last free evening from two phones cannot
 *              both win. None of that can be assembled safely from here.
 *
 *              findMeetingSlots is an action rather than a query because the
 *              dialog asks for it on open, from the client — the intersection is
 *              too expensive to compute for a chat nobody has opened the
 *              scheduler on.
 * Version:     0.29.0
 *
 * Modifications:
 *     0.29.0 - 2026-08-14 - dismissMeeting, the one-sided banner (Phase 9G)
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7)
 */

'use server';

import { revalidatePath } from 'next/cache';

import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import {
  pushMeetingToCalendar,
  removeMeetingFromAllCalendars,
  removeMeetingFromCalendar,
  syncUpcomingMeetings,
} from '@/features/calendar/write-sync';
import { createClient, requireUser } from '@/lib/supabase/server';

import type { MeetingSlotView } from './meeting-view';
import {
  createMeetingSchema,
  meetingIdSchema,
  meetingSlotsSchema,
  setRsvpSchema,
} from './schema';

/**
 * Refreshes every screen a booking changes.
 *
 * A meeting moves three things at once: the chat it was booked from, the
 * dashboard's week, and the profile of everyone who was at it — because once it
 * has finished, it is what unlocks rating them.
 *
 * @returns Nothing.
 */
function revalidateMeetingSurfaces() {
  revalidatePath('/messages', 'layout');
  revalidatePath('/groups', 'layout');
  revalidatePath('/dashboard');
  revalidatePath('/students', 'layout');
}

/**
 * Times every participant of a chat is free, with existing meetings removed.
 *
 * @param input - Which chat, and how far ahead to look.
 * @returns The bookable slots, or a failure.
 */
export async function findMeetingSlots(input: {
  conversationId?: string;
  groupId?: string;
  days?: number;
}): Promise<ActionResult<MeetingSlotView[]>> {
  try {
    await requireUser();
    const parsed = meetingSlotsSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('rpc_meeting_slots', {
      p_conversation_id: parsed.conversationId,
      p_group_id: parsed.groupId,
      p_days: parsed.days,
    });

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, 'We could not read that chat’s free time.');
    }

    return ok(
      (data ?? []).map((row) => ({
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        participantCount: row.participant_count,
      })),
    );
  } catch (error) {
    return toActionError(error, 'meetings.findMeetingSlots');
  }
}

/**
 * Books every session the picker selected, for everyone in the chat.
 *
 * ONE RPC FOR THE WHOLE SELECTION, NOT ONE CALL PER SESSION. Looping here would
 * commit each booking separately, so a clash on the third would leave the student
 * booked for the first two and holding an error about the rest — a state they
 * did not ask for and cannot undo in one action. rpc_create_meetings does the
 * loop inside a single transaction instead, so the selection either happens or
 * does not.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries the scope, the title, the place, and one
 *                   startsAt/endsAt pair per session.
 * @returns Success, or a failure naming what went wrong.
 */
export async function createMeeting(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();

    /*
     * getAll, paired by position. The picker renders one hidden input of each
     * name per session and the browser preserves document order, so index i of
     * one list belongs with index i of the other. The schema rejects a mismatch.
     */
    const startsAt = formData.getAll('startsAt').map(String).filter(Boolean);
    const endsAt = formData.getAll('endsAt').map(String).filter(Boolean);

    const raw = {
      conversationId: String(formData.get('conversationId') ?? '') || undefined,
      groupId: String(formData.get('groupId') ?? '') || undefined,
      title: String(formData.get('title') ?? ''),
      location: String(formData.get('location') ?? '') || undefined,
      sessions: startsAt.map((start, index) => ({
        startsAt: start,
        endsAt: endsAt[index] ?? '',
      })),
    };

    const input = createMeetingSchema.parse(raw);
    const supabase = await createClient();

    const { error } = await supabase.rpc('rpc_create_meetings', {
      p_conversation_id: input.conversationId,
      p_group_id: input.groupId,
      p_title: input.title,
      p_location: input.location,
      p_starts_at: input.sessions.map((session) => session.startsAt),
      p_ends_at: input.sessions.map((session) => session.endsAt),
    });

    if (error) {
      /*
       * The clash trigger is the one a student can actually hit by being slow:
       * they opened the picker, went to make coffee, and someone else took the
       * slot. It deserves its own sentence rather than a generic failure — and
       * with several sessions in flight it has to say that none of them were
       * booked, because that is what the transaction did.
       */
      if (error.message.includes('clash')) {
        return fail(
          ERROR_CODES.VALIDATION_FAILED,
          input.sessions.length === 1
            ? 'Someone has taken that time since you opened this. Pick another.'
            : 'Someone has taken one of those times since you opened this. Nothing was booked — pick again.',
          'startsAt',
        );
      }

      return fail(
        ERROR_CODES.FORBIDDEN,
        input.sessions.length === 1
          ? 'We could not book that session. Try again.'
          : 'We could not book those sessions. Try again.',
      );
    }

    /*
     * Reconciled rather than pushed by id: the RPC books every session in one
     * call and does not hand their ids back. Awaited so the calendar is already
     * right when the page revalidates — it never throws, and a student with no
     * calendar connected pays one cheap query for it.
     */
    await syncUpcomingMeetings(user.id);

    revalidateMeetingSurfaces();

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'meetings.createMeeting');
  }
}

/**
 * Steps out of a session, or back into one.
 *
 * Written straight to the row rather than through an RPC: it is one row, it is
 * the caller's own, and the policy plus the freeze trigger already say
 * everything about when it may change.
 *
 * @param input - The meeting, and whether they are coming.
 * @returns Success, or a failure.
 */
export async function setMeetingRsvp(input: {
  meetingId: string;
  going: boolean;
}): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const parsed = setRsvpSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from('meeting_attendees')
      .update({ rsvp: parsed.going ? 'going' : 'cancelled' })
      .eq('meeting_id', parsed.meetingId)
      .eq('profile_id', user.id);

    if (error) {
      /*
       * The freeze. Worth saying plainly, because the student's mental model —
       * "I can always cancel" — is right up until the session starts.
       */
      if (error.message.includes('already started')) {
        return fail(
          ERROR_CODES.FORBIDDEN,
          'This session has already started, so attendance can no longer change.',
        );
      }

      if (error.message.includes('clash')) {
        return fail(
          ERROR_CODES.VALIDATION_FAILED,
          'You have another session at that time now.',
        );
      }

      return fail(ERROR_CODES.UNEXPECTED, 'We could not update that. Try again.');
    }

    /*
     * Mirrored into Google after the RSVP has actually been accepted, so the
     * calendar never shows a session the database refused to record. Never
     * throws: attendance is the product, and a stale Google token must not be
     * able to fail it.
     */
    if (parsed.going) {
      await pushMeetingToCalendar(user.id, parsed.meetingId);
    } else {
      await removeMeetingFromCalendar(user.id, parsed.meetingId);
    }

    revalidateMeetingSurfaces();

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'meetings.setMeetingRsvp');
  }
}

/**
 * Clears a finished session's banner from the caller's own chat header.
 *
 * NOT A CANCELLATION AND NOT A DELETE. The meeting row, its status and every
 * attendance record are untouched — the rating rule in Phase 7D reads those, and
 * tidying a banner must not cost somebody the ability to rate the people they
 * actually sat with. The other attendees keep the banner until each of them
 * dismisses it.
 *
 * THE TIME RULE IS NOT CHECKED HERE. It is an INSERT policy on the table, so a
 * request that skips the UI hits the same wall as one that does not. All this
 * does is translate the refusal into a sentence.
 *
 * Written straight to the table rather than through an RPC, for the same reason
 * setMeetingRsvp is: it is one row, it is the caller's own, and the policy says
 * everything about when it may exist.
 *
 * @param input - The session whose banner to put away.
 * @returns Success, or a failure.
 */
export async function dismissMeeting(input: { meetingId: string }): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const parsed = meetingIdSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from('dismissed_meetings')
      .upsert(
        { profile_id: user.id, meeting_id: parsed.meetingId },
        /* Dismissing twice is dismissing once — not a duplicate-key error. */
        { onConflict: 'profile_id,meeting_id', ignoreDuplicates: true },
      );

    if (error) {
      /*
       * Almost always the policy: the session has not finished yet. The UI does
       * not draw the X before then, so a student only reaches this by racing the
       * clock — booking closed, page left open — and the sentence should say
       * what to do about it rather than blame them.
       */
      return fail(
        ERROR_CODES.FORBIDDEN,
        'You can only clear a session once it has finished.',
      );
    }

    revalidateMeetingSurfaces();

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'meetings.dismissMeeting');
  }
}

/**
 * Calls the whole session off, which frees the slot for everyone at once.
 *
 * Restricted to the organiser by the RPC. Anyone else steps out with their own
 * RSVP — one person not coming is not the session being cancelled.
 *
 * @param input - The meeting to call off.
 * @returns Success, or a failure.
 */
export async function cancelMeeting(input: { meetingId: string }): Promise<ActionResult<void>> {
  try {
    await requireUser();
    const parsed = meetingIdSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.rpc('rpc_cancel_meeting', {
      p_meeting_id: parsed.meetingId,
    });

    if (error) {
      return fail(
        ERROR_CODES.FORBIDDEN,
        'That session is not yours to cancel, or has already started.',
      );
    }

    /*
     * Every attendee's copy, not just the organiser's. A cancelled session that
     * stays in four other people's calendars is worse than one that was never
     * mirrored — they would each turn up.
     */
    await removeMeetingFromAllCalendars(parsed.meetingId);

    revalidateMeetingSurfaces();

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'meetings.cancelMeeting');
  }
}
