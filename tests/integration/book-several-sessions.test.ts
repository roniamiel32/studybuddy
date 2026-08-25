/**
 * File:        tests/integration/book-several-sessions.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Phase 9H — booking a whole selection in one transaction.
 *
 *              THE ATOMICITY TEST IS THE REASON THIS FILE EXISTS. Everything
 *              else here would pass just as well against a client-side loop
 *              calling rpc_create_meeting several times, and that loop has a
 *              failure mode nobody would find by hand: the third booking clashes
 *              after the first two have already committed, so the student is
 *              left booked for part of a selection they will be told failed.
 *              Asserting that a clash mid-array leaves NOTHING behind is the
 *              only way to pin the transaction down.
 *
 *              The clash is manufactured rather than raced. One of the two
 *              students is booked for an hour first, and the array then includes
 *              that hour in second position — deterministic, and exactly the
 *              shape of the real thing.
 * Version:     0.30.0
 *
 * Modifications:
 *     0.30.0 - 2026-08-14 - Initial tests (Phase 9H)
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
  signInAs,
} from './helpers/db';

const describeDb = hasLocalDb() ? describe : describe.skip;

if (!hasLocalDb()) {
  console.warn('Skipping multi-booking tests: run `npm run db:start` and populate .env.local.');
}

describeDb('Booking several sessions at once', () => {
  const admin = hasLocalDb() ? adminDb() : null!;
  const stamp = Math.random().toString(36).slice(2, 8);

  const emails = {
    ada: `bs-ada-${stamp}@post.runi.ac.il`,
    ben: `bs-ben-${stamp}@post.runi.ac.il`,
  };

  const ids: Record<keyof typeof emails, string> = { ada: '', ben: '' };
  const clients: Record<keyof typeof emails, SupabaseClient<Database>> = {} as never;

  let conversationId = '';

  /** A two-hour window `dayOffset` days out, starting at `hour` UTC. */
  function window(dayOffset: number, hour: number) {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + dayOffset);
    start.setUTCHours(hour, 0, 0, 0);

    return {
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 7_200_000).toISOString(),
    };
  }

  /** The sessions currently booked in this conversation. */
  async function booked() {
    const { data } = await admin
      .from('meetings')
      .select('id, title, starts_at, ends_at')
      .eq('conversation_id', conversationId)
      .order('starts_at');

    return data ?? [];
  }

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
  }, 90_000);

  afterAll(async () => {
    if (hasLocalDb()) {
      await deleteStudents(admin, Object.values(ids));
    }
  });

  it('books every session in the array, and invites everyone to each', async () => {
    const first = window(3, 8);
    const second = window(5, 8);

    const { data, error } = await clients.ada.rpc('rpc_create_meetings', {
      p_conversation_id: conversationId,
      p_title: 'Revision run',
      p_location: 'Library, floor 2',
      p_starts_at: [first.startsAt, second.startsAt],
      p_ends_at: [first.endsAt, second.endsAt],
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(2);

    const { data: attendees } = await admin
      .from('meeting_attendees')
      .select('meeting_id, profile_id')
      .in('meeting_id', data as string[]);

    /* Two sessions, both people at each. */
    expect(attendees).toHaveLength(4);
  });

  it('leaves nothing behind when one of them clashes', async () => {
    /*
     * THE TEST THIS FILE EXISTS FOR. Ben is booked first, then Ada asks for
     * three sessions of which the middle one collides. A per-call loop would
     * commit the first and report a failure; the transaction must not.
     */
    const clashing = window(9, 8);

    const blocked = await clients.ben.rpc('rpc_create_meeting', {
      p_conversation_id: conversationId,
      p_title: 'Already spoken for',
      p_starts_at: clashing.startsAt,
      p_ends_at: clashing.endsAt,
    });
    expect(blocked.error).toBeNull();

    const before = await booked();

    const safeFirst = window(8, 8);
    const safeLast = window(10, 8);

    const { error } = await clients.ada.rpc('rpc_create_meetings', {
      p_conversation_id: conversationId,
      p_title: 'Should not survive',
      p_starts_at: [safeFirst.startsAt, clashing.startsAt, safeLast.startsAt],
      p_ends_at: [safeFirst.endsAt, clashing.endsAt, safeLast.endsAt],
    });

    /* 23505 from the clash trigger, raised on the SECOND element — so the first
       insert had already happened when the transaction unwound. That is what
       makes the comparison below meaningful rather than vacuous. */
    expect(error?.code).toBe('23505');

    const after = await booked();

    expect(after).toEqual(before);
    expect(after.some((meeting) => meeting.title === 'Should not survive')).toBe(false);
  });

  it('refuses an empty selection', async () => {
    const { error } = await clients.ada.rpc('rpc_create_meetings', {
      p_conversation_id: conversationId,
      p_title: 'Nothing picked',
      p_starts_at: [],
      p_ends_at: [],
    });

    expect(error).not.toBeNull();
  });

  it('refuses arrays that do not line up', async () => {
    /* Starts and ends are paired by position, so a length mismatch is a bug in
       the caller rather than a session with no end. */
    const one = window(12, 8);
    const two = window(13, 8);

    const { error } = await clients.ada.rpc('rpc_create_meetings', {
      p_conversation_id: conversationId,
      p_title: 'Lopsided',
      p_starts_at: [one.startsAt, two.startsAt],
      p_ends_at: [one.endsAt],
    });

    expect(error).not.toBeNull();
  });

  it('refuses a selection from somebody outside the chat', async () => {
    /* rpc_create_meeting resolves participants per call, and the wrapper does
       not weaken it. */
    const outsiderId = await createStudent(admin, `bs-out-${stamp}@post.runi.ac.il`);
    const outsider = await signInAs(`bs-out-${stamp}@post.runi.ac.il`);
    const slot = window(15, 8);

    const { error } = await outsider.rpc('rpc_create_meetings', {
      p_conversation_id: conversationId,
      p_title: 'Not mine to book',
      p_starts_at: [slot.startsAt],
      p_ends_at: [slot.endsAt],
    });

    expect(error).not.toBeNull();

    await deleteStudents(admin, [outsiderId]);
  });

  it('accepts a full day, and still refuses a session longer than one', async () => {
    /*
     * The bound moved from eight hours to twenty-four so a student can book a
     * whole day of revision. It is still a bound, and still for the same
     * reason: an unbounded session lets a mistyped year quietly subtract months
     * from every attendee's availability, because busy time is derived from the
     * meetings people are going to.
     */
    const fullDay = window(16, 6);

    const wholeDay = await clients.ada.rpc('rpc_create_meetings', {
      p_conversation_id: conversationId,
      p_title: 'All-day revision',
      p_starts_at: [fullDay.startsAt],
      p_ends_at: [new Date(new Date(fullDay.startsAt).getTime() + 12 * 3_600_000).toISOString()],
    });

    expect(wholeDay.error).toBeNull();
    const start = window(17, 6);

    const { error } = await clients.ada.rpc('rpc_create_meetings', {
      p_conversation_id: conversationId,
      p_title: 'A residency',
      p_starts_at: [start.startsAt],
      p_ends_at: [new Date(new Date(start.startsAt).getTime() + 30 * 3_600_000).toISOString()],
    });

    expect(error).not.toBeNull();
  });
});
