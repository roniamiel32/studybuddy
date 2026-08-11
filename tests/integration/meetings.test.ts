/**
 * File:        tests/integration/meetings.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Phase 7C — the scheduler, the intersection, and the freeze.
 *
 *              THE INTERSECTION IS THE FEATURE, and the test that matters most
 *              is the one asserting an hour is NOT offered. A union dressed up as
 *              an intersection would pass every positive test in this file: it
 *              would return plenty of slots, all of them plausible, and none of
 *              them times everybody was actually free.
 *
 *              THE FREEZE IS THE OTHER HALF. Phase 7D's rating rule rests
 *              entirely on attendance being unrewritable after the fact, so the
 *              cancel-skip-rejoin route is tried here rather than taken on trust.
 *
 *              Availability is deliberately seeded as awkward, non-overlapping
 *              blocks: two students free all Sunday afternoon and one free for a
 *              single hour of it is the case where a wrong intersection is
 *              indistinguishable from a right one on a happy path.
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - Initial tests (Phase 7C)
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
  console.warn('Skipping meeting tests: run `npm run db:start` and populate .env.local.');
}

const DENIED = '42501';

/** Sunday, in the numbering the schema uses (0 = Sunday, as extract(dow) does). */
const SUNDAY = 0;

describeDb('Meetings: scheduling, blocking and attendance', () => {
  const admin = hasLocalDb() ? adminDb() : null!;
  const stamp = Math.random().toString(36).slice(2, 8);

  const emails = {
    ada: `mt-ada-${stamp}@post.runi.ac.il`,
    ben: `mt-ben-${stamp}@post.runi.ac.il`,
    /* In the group, free at a completely different time. */
    cleo: `mt-cleo-${stamp}@post.runi.ac.il`,
    /* In no chat at all. */
    outsider: `mt-outsider-${stamp}@post.runi.ac.il`,
  };

  const ids: Record<keyof typeof emails, string> = {
    ada: '',
    ben: '',
    cleo: '',
    outsider: '',
  };

  const clients: Record<keyof typeof emails, SupabaseClient<Database>> = {} as never;

  let offeringId = '';
  let conversationId = '';
  let groupId = '';

  /** The next Sunday strictly in the future, as a yyyy-mm-dd date. */
  function nextSunday(): string {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    do {
      date.setUTCDate(date.getUTCDate() + 1);
    } while (date.getUTCDay() !== SUNDAY);

    return date.toISOString().slice(0, 10);
  }

  beforeAll(async () => {
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      ids[key] = await createStudent(admin, emails[key]);
    }

    offeringId = await offeringIdByCode(admin, 'CS-3040', RUNI_CURRENT_TERM_ID);

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

    /*
     * The availability that makes the intersection provable.
     *
     *   Ada  Sunday 10-12, 12-14, 14-16
     *   Ben  Sunday        12-14, 14-16, 16-18
     *   Cleo Sunday                      16-18
     *
     * Ada and Ben share 12-16. All three share only 16-18 — and Ada is not free
     * then, so the group of three shares nothing at all.
     */
    const slots = await admin.from('availability_slots').insert([
      { profile_id: ids.ada, day_of_week: SUNDAY, starts_at: '10:00', ends_at: '12:00' },
      { profile_id: ids.ada, day_of_week: SUNDAY, starts_at: '12:00', ends_at: '14:00' },
      { profile_id: ids.ada, day_of_week: SUNDAY, starts_at: '14:00', ends_at: '16:00' },
      { profile_id: ids.ben, day_of_week: SUNDAY, starts_at: '12:00', ends_at: '14:00' },
      { profile_id: ids.ben, day_of_week: SUNDAY, starts_at: '14:00', ends_at: '16:00' },
      { profile_id: ids.ben, day_of_week: SUNDAY, starts_at: '16:00', ends_at: '18:00' },
      { profile_id: ids.cleo, day_of_week: SUNDAY, starts_at: '16:00', ends_at: '18:00' },
    ]);
    if (slots.error) {
      throw new Error(`availability seed failed: ${slots.error.message}`);
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

    const group = await clients.ada
      .from('study_groups')
      .insert({
        course_offering_id: offeringId,
        university_id: RUNI_ID,
        admin_id: ids.ada,
        name: 'Sunday revision crew',
        max_participants: 5,
      })
      .select('id')
      .single();
    if (group.error) {
      throw new Error(`group seed failed: ${group.error.message}`);
    }
    groupId = group.data.id;

    for (const who of ['ben', 'cleo'] as const) {
      const asked = await clients[who]
        .from('group_requests')
        .insert({ group_id: groupId, requester_id: ids[who], status: 'pending' })
        .select('id')
        .single();
      if (asked.error) {
        throw new Error(`request seed failed: ${asked.error.message}`);
      }

      const approved = await clients.ada.rpc('rpc_approve_group_request', {
        p_request_id: asked.data.id,
      });
      if (approved.error) {
        throw new Error(`approval seed failed: ${approved.error.message}`);
      }
    }
  }, 90_000);

  afterAll(async () => {
    await deleteStudents(admin, Object.values(ids));
  });

  // ===========================================================================
  // The intersection.
  // ===========================================================================

  describe('rpc_meeting_slots offers only time everyone shares', () => {
    it('returns the hours the two of them share, and nothing else', async () => {
      const { data, error } = await clients.ada.rpc('rpc_meeting_slots', {
        p_conversation_id: conversationId,
        p_from: nextSunday(),
        p_days: 1,
      });

      expect(error).toBeNull();

      const hours = (data ?? []).map((row) => new Date(row.starts_at).getHours());

      /* 12-14 and 14-16: the overlap, as two bookable blocks. */
      expect(hours).toEqual([12, 14]);
    });

    it('does NOT offer an hour only one of them is free for', async () => {
      /*
       * THE TEST THIS SUITE EXISTS FOR. Ada is free 10-12 and Ben is not; Ben is
       * free 16-18 and Ada is not. A union — the natural wrong implementation —
       * would return both and look perfectly reasonable.
       */
      const { data } = await clients.ada.rpc('rpc_meeting_slots', {
        p_conversation_id: conversationId,
        p_from: nextSunday(),
        p_days: 1,
      });

      const hours = (data ?? []).map((row) => new Date(row.starts_at).getHours());

      expect(hours).not.toContain(10);
      expect(hours).not.toContain(16);
    });

    it('returns nothing for a group with no common hour at all', async () => {
      /*
       * Ada, Ben and Cleo share no time. An empty answer is the honest one, and
       * the HAVING clause is what produces it — without that, a day where two of
       * the three are free would quietly be offered to all three.
       */
      const { data, error } = await clients.ada.rpc('rpc_meeting_slots', {
        p_group_id: groupId,
        p_from: nextSunday(),
        p_days: 1,
      });

      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);
    });

    it('refuses a chat the caller is not in', async () => {
      const { error } = await clients.outsider.rpc('rpc_meeting_slots', {
        p_conversation_id: conversationId,
        p_from: nextSunday(),
        p_days: 1,
      });

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/not yours/i);
    });

    it('refuses being asked about both a conversation and a group at once', async () => {
      const { error } = await clients.ada.rpc('rpc_meeting_slots', {
        p_conversation_id: conversationId,
        p_group_id: groupId,
        p_from: nextSunday(),
        p_days: 1,
      });

      expect(error).not.toBeNull();
    });
  });

  // ===========================================================================
  // Booking, and what it blocks.
  // ===========================================================================

  describe('booking a meeting blocks the slot for everyone in it', () => {
    let meetingId = '';

    it('creates the meeting with everyone on it', async () => {
      const { data, error } = await clients.ada.rpc('rpc_create_meeting', {
        p_conversation_id: conversationId,
        p_title: 'Past papers',
        p_starts_at: `${nextSunday()}T12:00:00+03:00`,
        p_ends_at: `${nextSunday()}T14:00:00+03:00`,
        p_location: 'Library, floor 2',
      });

      expect(error).toBeNull();
      meetingId = data as unknown as string;

      const attendees = await clients.ada
        .from('meeting_attendees')
        .select('profile_id, rsvp')
        .eq('meeting_id', meetingId);

      expect(attendees.data).toHaveLength(2);
      expect((attendees.data ?? []).every((row) => row.rsvp === 'going')).toBe(true);
    });

    it('shows as busy in both students’ schedules, with the meeting’s info', async () => {
      for (const who of ['ada', 'ben'] as const) {
        const { data, error } = await clients[who].rpc('rpc_my_schedule', {});

        expect(error).toBeNull();

        const mine = (data ?? []).find((row) => row.meeting_id === meetingId);
        expect(mine).toBeDefined();
        expect(mine!.title).toBe('Past papers');
        expect(mine!.location).toBe('Library, floor 2');
        expect(mine!.other_attendees).toBe(1);
      }
    });

    it('removes the slot from the intersection it came from', async () => {
      /*
       * "The system must block this timeslot." Nothing was written to
       * availability_slots to achieve it — the meeting itself is the block, and
       * this is what proves the two readers agree on that definition.
       */
      const { data } = await clients.ada.rpc('rpc_meeting_slots', {
        p_conversation_id: conversationId,
        p_from: nextSunday(),
        p_days: 1,
      });

      const hours = (data ?? []).map((row) => new Date(row.starts_at).getHours());

      expect(hours).not.toContain(12);
      /* The other shared block is still on offer. */
      expect(hours).toContain(14);
    });

    it('leaves the weekly availability grid untouched', async () => {
      /*
       * The modelling rule, asserted rather than assumed. availability_slots is a
       * weekly template of FREE time; a "busy" row in it would invert the meaning
       * of a table the matching engine sums.
       */
      const { data } = await clients.ada
        .from('availability_slots')
        .select('day_of_week, starts_at')
        .eq('profile_id', ids.ada);

      expect(data).toHaveLength(3);
    });

    it('refuses a second meeting that clashes with it', async () => {
      const { error } = await clients.ada.rpc('rpc_create_meeting', {
        p_conversation_id: conversationId,
        p_title: 'Double booked',
        p_starts_at: `${nextSunday()}T13:00:00+03:00`,
        p_ends_at: `${nextSunday()}T15:00:00+03:00`,
      });

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/clash/i);
    });

    it('refuses a meeting in the past', async () => {
      const { error } = await clients.ada.rpc('rpc_create_meeting', {
        p_conversation_id: conversationId,
        p_title: 'Yesterday',
        p_starts_at: new Date(Date.now() - 172_800_000).toISOString(),
        p_ends_at: new Date(Date.now() - 165_600_000).toISOString(),
      });

      expect(error).not.toBeNull();
    });

    it('refuses booking into a chat the caller is not in', async () => {
      const { error } = await clients.outsider.rpc('rpc_create_meeting', {
        p_conversation_id: conversationId,
        p_title: 'Gatecrash',
        p_starts_at: `${nextSunday()}T18:00:00+03:00`,
        p_ends_at: `${nextSunday()}T20:00:00+03:00`,
      });

      expect(error?.message).toMatch(/not yours/i);
    });

    it('is invisible to someone who was not invited', async () => {
      const { data } = await clients.outsider
        .from('meetings')
        .select('id')
        .eq('id', meetingId);

      /* Where two students are meeting is more sensitive than that a group exists. */
      expect(data ?? []).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Cancelling, and the freeze that makes the rating rule hold.
  // ===========================================================================

  describe('cancelling an RSVP frees the slot immediately', () => {
    let meetingId = '';

    beforeAll(async () => {
      const { data } = await clients.ada.rpc('rpc_create_meeting', {
        p_conversation_id: conversationId,
        p_title: 'Cancellable',
        p_starts_at: `${nextSunday()}T14:00:00+03:00`,
        p_ends_at: `${nextSunday()}T16:00:00+03:00`,
      });

      meetingId = data as unknown as string;
    });

    it('lets a student cancel their own attendance', async () => {
      const { error } = await clients.ben
        .from('meeting_attendees')
        .update({ rsvp: 'cancelled' })
        .eq('meeting_id', meetingId)
        .eq('profile_id', ids.ben);

      expect(error).toBeNull();
    });

    it('drops it out of their schedule at once', async () => {
      const { data } = await clients.ben.rpc('rpc_my_schedule', {});

      expect((data ?? []).map((row) => row.meeting_id)).not.toContain(meetingId);
    });

    it('leaves it in the organiser’s schedule', async () => {
      /* One person stepping out is not the session being called off. */
      const { data } = await clients.ada.rpc('rpc_my_schedule', {});

      expect((data ?? []).map((row) => row.meeting_id)).toContain(meetingId);
    });

    it('refuses cancelling for somebody else', async () => {
      const { data } = await clients.ben
        .from('meeting_attendees')
        .update({ rsvp: 'cancelled' })
        .eq('meeting_id', meetingId)
        .eq('profile_id', ids.ada)
        .select('profile_id');

      expect(data ?? []).toHaveLength(0);
    });

    it('refuses changing attendance once the meeting has started', async () => {
      /*
       * THE FREEZE, and the reason Phase 7D's rating rule is enforceable at all.
       * Without it: cancel, skip the session, then set yourself back to going
       * afterwards and rate people you never sat with. The meeting is backdated
       * through the service role, which is the only way to reach the state.
       */
      await admin
        .from('meetings')
        .update({
          starts_at: new Date(Date.now() - 7_200_000).toISOString(),
          ends_at: new Date(Date.now() - 3_600_000).toISOString(),
        })
        .eq('id', meetingId);

      const { error } = await clients.ben
        .from('meeting_attendees')
        .update({ rsvp: 'going' })
        .eq('meeting_id', meetingId)
        .eq('profile_id', ids.ben);

      expect(error?.code).toBe(DENIED);
      expect(error?.message).toMatch(/already started/i);
    });

    it('and so the person who cancelled cannot rate the one who came', async () => {
      /*
       * The forfeit, end to end: the session happened, Ben was not there, and no
       * rating of Ada is available to him — enforced by the same predicate the
       * policy uses, on evidence he can no longer change.
       */
      const { error } = await clients.ben.from('study_ratings').insert({
        rater_id: ids.ben,
        ratee_id: ids.ada,
        sentiment: 'positive',
      });

      expect(error?.code).toBe(DENIED);
    });
  });

  // ===========================================================================
  // Rating what did happen.
  // ===========================================================================

  describe('a finished meeting unlocks rating the people who were at it', () => {
    let meetingId = '';

    beforeAll(async () => {
      const { data } = await clients.ada.rpc('rpc_create_meeting', {
        p_group_id: groupId,
        p_title: 'Group session that happened',
        p_starts_at: `${nextSunday()}T20:00:00+03:00`,
        p_ends_at: `${nextSunday()}T22:00:00+03:00`,
      });

      meetingId = data as unknown as string;

      await admin
        .from('meetings')
        .update({
          starts_at: new Date(Date.now() - 10_800_000).toISOString(),
          ends_at: new Date(Date.now() - 3_600_000).toISOString(),
        })
        .eq('id', meetingId);
    });

    it('lets one attendee rate another', async () => {
      const { error } = await clients.cleo.from('study_ratings').insert({
        rater_id: ids.cleo,
        ratee_id: ids.ada,
        sentiment: 'positive',
        meeting_id: meetingId,
      });

      expect(error).toBeNull();
    });

    it('lets an attendee rate the session as a whole', async () => {
      const { error } = await clients.cleo.from('group_meeting_ratings').insert({
        rater_id: ids.cleo,
        group_id: groupId,
        meeting_id: meetingId,
        sentiment: 'positive',
      });

      expect(error).toBeNull();
    });

    it('refuses a session rating from someone who was not there', async () => {
      const { error } = await clients.outsider.from('group_meeting_ratings').insert({
        rater_id: ids.outsider,
        group_id: groupId,
        meeting_id: meetingId,
        sentiment: 'negative',
      });

      expect(error?.code).toBe(DENIED);
    });

    it('refuses naming a meeting the pair were not both at', async () => {
      /*
       * meeting_id is provenance, and provenance that can be forged is decoration.
       *
       * Cleo may rate Ada — they were at the group session together, so the pair
       * rule passes and only the named meeting is wrong. Written as an UPDATE
       * because Cleo already holds that rating, which also proves the check
       * covers the edit path and not only the insert.
       */
      const privateMeeting = await clients.ada.rpc('rpc_create_meeting', {
        p_conversation_id: conversationId,
        p_title: 'Just the two of us',
        p_starts_at: `${nextSunday()}T14:00:00+03:00`,
        p_ends_at: `${nextSunday()}T16:00:00+03:00`,
      });

      expect(privateMeeting.error).toBeNull();

      await admin
        .from('meetings')
        .update({
          starts_at: new Date(Date.now() - 108_000_000).toISOString(),
          ends_at: new Date(Date.now() - 100_800_000).toISOString(),
        })
        .eq('id', privateMeeting.data as unknown as string);

      const { error } = await clients.cleo
        .from('study_ratings')
        .update({ meeting_id: privateMeeting.data as unknown as string })
        .eq('rater_id', ids.cleo)
        .eq('ratee_id', ids.ada);

      expect(error?.code).toBe('23514');
    });
  });
});
