/**
 * File:        tests/integration/dismissed-meetings.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Phase 9G — clearing a finished session's banner, for yourself.
 *
 *              THE TWO TESTS THAT MATTER are the negative ones, and neither is
 *              reachable through the interface. The UI does not draw the X until
 *              a session has ended and only ever offers it on your own chats, so
 *              "you cannot dismiss a session that has not happened" and "you
 *              cannot dismiss somebody else's" are claims about the INSERT
 *              policy alone. If the policy said only `profile_id = auth.uid()`
 *              every positive test here would still pass, and the feature would
 *              be a way to silently stop turning up — clear the banner on
 *              Tuesday's session and the reminder that you agreed to go is gone.
 *
 *              ONE-SIDEDNESS IS ASSERTED FROM BOTH ENDS. That Ada dismissed
 *              something is checked to be invisible to Ben, not merely absent
 *              from what he was shown: a SELECT policy that leaked would let one
 *              student see which sessions the other had written off, which is a
 *              fact about how much they care that nobody agreed to publish.
 * Version:     0.29.0
 *
 * Modifications:
 *     0.29.0 - 2026-08-14 - Initial tests (Phase 9G)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';
import {
  RUNI_CURRENT_TERM_ID,
  RUNI_ID,
  adminDb,
  createStudent,
  deleteStudents,
  hasLocalDb,
  offeringIdByCode,
  seedCompletedMeeting,
  signInAs,
} from './helpers/db';

const describeDb = hasLocalDb() ? describe : describe.skip;

/** Postgres insufficient_privilege — what an RLS refusal arrives as. */
const DENIED = '42501';

if (!hasLocalDb()) {
  console.warn('Skipping dismissal tests: run `npm run db:start` and populate .env.local.');
}

describeDb('Dismissing a session banner', () => {
  const admin = hasLocalDb() ? adminDb() : null!;
  const stamp = Math.random().toString(36).slice(2, 8);

  const emails = {
    ada: `dm-ada-${stamp}@post.runi.ac.il`,
    ben: `dm-ben-${stamp}@post.runi.ac.il`,
    /* In no chat and at no session. */
    outsider: `dm-outsider-${stamp}@post.runi.ac.il`,
  };

  const ids: Record<keyof typeof emails, string> = { ada: '', ben: '', outsider: '' };
  const clients: Record<keyof typeof emails, SupabaseClient<Database>> = {} as never;

  let conversationId = '';
  /** Ended two hours ago, so it may be dismissed. */
  let finishedMeetingId = '';
  /** Still ahead of them, so it may not. */
  let upcomingMeetingId = '';

  beforeAll(async () => {
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      ids[key] = await createStudent(admin, emails[key]);
    }

    const offeringId = await offeringIdByCode(admin, 'CS-3040', RUNI_CURRENT_TERM_ID);

    const enrolled = await admin.from('enrollments').insert(
      Object.values(ids).map((id) => ({
        profile_id: id,
        course_offering_id: offeringId,
        university_id: RUNI_ID,
      })),
    );
    if (enrolled.error) {
      throw new Error(`enrolment seed failed: ${enrolled.error.message}`);
    }

    await admin
      .from('profiles')
      .update({ is_discoverable: true, onboarding_completed_at: new Date().toISOString() })
      .in('id', Object.values(ids));

    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      clients[key] = await signInAs(emails[key]);
    }

    const conversation = await clients.ada
      .from('conversations')
      .insert({
        participant_a: ids.ada,
        participant_b: ids.ben,
        university_id: RUNI_ID,
        course_offering_id: offeringId,
      })
      .select('id')
      .single();
    if (conversation.error) {
      throw new Error(`conversation seed failed: ${conversation.error.message}`);
    }
    conversationId = conversation.data.id;

    finishedMeetingId = await seedCompletedMeeting(admin, {
      universityId: RUNI_ID,
      participants: [ids.ada, ids.ben],
      conversationId,
      title: 'Recursion catch-up',
    });

    /* Not seedCompletedMeeting: this one has to stay in the future. */
    const upcoming = await admin
      .from('meetings')
      .insert({
        university_id: RUNI_ID,
        conversation_id: conversationId,
        created_by: ids.ada,
        title: 'Exam revision',
        starts_at: new Date(Date.now() + 172_800_000).toISOString(),
        ends_at: new Date(Date.now() + 180_000_000).toISOString(),
      })
      .select('id')
      .single();
    if (upcoming.error) {
      throw new Error(`upcoming meeting seed failed: ${upcoming.error.message}`);
    }
    upcomingMeetingId = upcoming.data.id;

    const attendees = await admin.from('meeting_attendees').insert([
      { meeting_id: upcomingMeetingId, profile_id: ids.ada, rsvp: 'going' as const },
      { meeting_id: upcomingMeetingId, profile_id: ids.ben, rsvp: 'going' as const },
    ]);
    if (attendees.error) {
      throw new Error(`upcoming attendee seed failed: ${attendees.error.message}`);
    }
  });

  afterAll(async () => {
    if (hasLocalDb()) {
      await deleteStudents(admin, Object.values(ids));
    }
  });

  it('lets an attendee clear a session that has finished', async () => {
    const { error } = await clients.ada
      .from('dismissed_meetings')
      .insert({ profile_id: ids.ada, meeting_id: finishedMeetingId });

    expect(error).toBeNull();
  });

  it('refuses a session that has not finished yet', async () => {
    /*
     * The rule the X's render condition mirrors, stated where it cannot be
     * skipped. Hiding a session you have not been to is how somebody quietly
     * stops turning up on the people expecting them.
     */
    const { error } = await clients.ada
      .from('dismissed_meetings')
      .insert({ profile_id: ids.ada, meeting_id: upcomingMeetingId });

    /* The code, not merely "an error": a refusal for the wrong reason — a
       missing grant, a bad column — would pass a null check while proving the
       time rule was never consulted. */
    expect(error?.code).toBe(DENIED);
  });

  it('refuses a session the caller was never invited to', async () => {
    const { error } = await clients.outsider
      .from('dismissed_meetings')
      .insert({ profile_id: ids.outsider, meeting_id: finishedMeetingId });

    expect(error?.code).toBe(DENIED);
  });

  it('refuses a dismissal written on somebody else’s behalf', async () => {
    const { error } = await clients.ben
      .from('dismissed_meetings')
      .insert({ profile_id: ids.ada, meeting_id: finishedMeetingId });

    expect(error?.code).toBe(DENIED);
  });

  it('keeps one student’s dismissal invisible to the other', async () => {
    /*
     * Ada dismissed the finished session in the first test. Ben was at the same
     * session and can read the meeting itself — the question is whether the
     * SELECT policy lets him read what she did about it.
     */
    const { data: hers } = await clients.ada
      .from('dismissed_meetings')
      .select('meeting_id, profile_id')
      .eq('meeting_id', finishedMeetingId);

    expect(hers).toEqual([{ meeting_id: finishedMeetingId, profile_id: ids.ada }]);

    const { data: his } = await clients.ben
      .from('dismissed_meetings')
      .select('meeting_id, profile_id')
      .eq('meeting_id', finishedMeetingId);

    expect(his).toEqual([]);
  });

  it('leaves the meeting and the attendance record untouched', async () => {
    /*
     * The Phase 7D rating rule reads both. Tidying a banner must not cost
     * somebody the ability to rate the people they actually sat with.
     */
    const { data: meeting } = await clients.ada
      .from('meetings')
      .select('id, status')
      .eq('id', finishedMeetingId)
      .single();

    expect(meeting).toEqual({ id: finishedMeetingId, status: 'scheduled' });

    const { data: attendees } = await clients.ada
      .from('meeting_attendees')
      .select('profile_id, rsvp')
      .eq('meeting_id', finishedMeetingId)
      .order('profile_id');

    expect(attendees).toHaveLength(2);
    expect(attendees?.every((row) => row.rsvp === 'going')).toBe(true);
  });

  it('lets a student bring their own banner back, and nobody else’s', async () => {
    /* Ben cannot delete Ada's row — the delete simply matches nothing. */
    await clients.ben
      .from('dismissed_meetings')
      .delete()
      .eq('meeting_id', finishedMeetingId)
      .eq('profile_id', ids.ada);

    const { data: stillThere } = await clients.ada
      .from('dismissed_meetings')
      .select('meeting_id')
      .eq('meeting_id', finishedMeetingId);

    expect(stillThere).toHaveLength(1);

    /* Ada can. */
    const { error } = await clients.ada
      .from('dismissed_meetings')
      .delete()
      .eq('meeting_id', finishedMeetingId)
      .eq('profile_id', ids.ada);

    expect(error).toBeNull();

    const { data: gone } = await clients.ada
      .from('dismissed_meetings')
      .select('meeting_id')
      .eq('meeting_id', finishedMeetingId);

    expect(gone).toEqual([]);
  });

  it('treats dismissing twice as dismissing once', async () => {
    const first = await clients.ada
      .from('dismissed_meetings')
      .upsert(
        { profile_id: ids.ada, meeting_id: finishedMeetingId },
        { onConflict: 'profile_id,meeting_id', ignoreDuplicates: true },
      );

    expect(first.error).toBeNull();

    const second = await clients.ada
      .from('dismissed_meetings')
      .upsert(
        { profile_id: ids.ada, meeting_id: finishedMeetingId },
        { onConflict: 'profile_id,meeting_id', ignoreDuplicates: true },
      );

    expect(second.error).toBeNull();

    const { data } = await clients.ada
      .from('dismissed_meetings')
      .select('meeting_id')
      .eq('meeting_id', finishedMeetingId);

    expect(data).toHaveLength(1);
  });

  it('forgets the dismissal when the meeting is deleted', async () => {
    /*
     * `on delete cascade` rather than a dangling row. A meeting that goes takes
     * every private note about it with it.
     */
    const scratchMeetingId = await seedCompletedMeeting(admin, {
      universityId: RUNI_ID,
      participants: [ids.ada, ids.ben],
      conversationId,
      title: 'Scratch session',
    });

    await clients.ada
      .from('dismissed_meetings')
      .insert({ profile_id: ids.ada, meeting_id: scratchMeetingId });

    await admin.from('meetings').delete().eq('id', scratchMeetingId);

    const { data } = await admin
      .from('dismissed_meetings')
      .select('meeting_id')
      .eq('meeting_id', scratchMeetingId);

    expect(data).toEqual([]);
  });
});
