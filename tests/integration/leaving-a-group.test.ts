/**
 * File:        tests/integration/leaving-a-group.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Phase 10B — what leaving a group has to undo, and what it must not.
 *
 *              THE COUNT WAS THE SYMPTOM AND THE BOUNDARY IS THE RISK. A group of
 *              two showed "2 others coming" because a departed member's rsvp was
 *              still sitting on an upcoming session. Withdrawing them fixes the
 *              count — but the same delete aimed one row wider would reach a
 *              session that has already happened, and that attendance is what
 *              the Phase 7D rating rule reads. Somebody could then erase the
 *              evidence of a session they sat through by leaving the group
 *              afterwards. Both halves are asserted, and the second one is the
 *              one worth keeping.
 * Version:     0.33.0
 *
 * Modifications:
 *     0.33.0 - 2026-08-15 - Initial tests (Phase 10B)
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

if (!hasLocalDb()) {
  console.warn('Skipping leave-group tests: run `npm run db:start` and populate .env.local.');
}

describeDb('Leaving a study group', () => {
  const admin = hasLocalDb() ? adminDb() : null!;
  const stamp = Math.random().toString(36).slice(2, 8);

  const emails = {
    owner: `lg-owner-${stamp}@post.runi.ac.il`,
    stays: `lg-stays-${stamp}@post.runi.ac.il`,
    leaves: `lg-leaves-${stamp}@post.runi.ac.il`,
  };

  const ids: Record<keyof typeof emails, string> = { owner: '', stays: '', leaves: '' };
  const clients: Record<keyof typeof emails, SupabaseClient<Database>> = {} as never;

  let groupId = '';
  let upcomingMeetingId = '';
  let finishedMeetingId = '';

  /** Everyone still marked as going to a session. */
  async function going(meetingId: string) {
    const { data } = await admin
      .from('meeting_attendees')
      .select('profile_id')
      .eq('meeting_id', meetingId)
      .eq('rsvp', 'going');

    return (data ?? []).map((row) => row.profile_id);
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

    const group = await clients.owner
      .from('study_groups')
      .insert({
        course_offering_id: offeringId,
        university_id: RUNI_ID,
        admin_id: ids.owner,
        name: `Leavers ${stamp}`,
        max_participants: 5,
      })
      .select('id')
      .single();
    if (group.error) {
      throw new Error(`group seed failed: ${group.error.message}`);
    }
    groupId = group.data.id;

    /* Both join properly, through a request and an approval. */
    for (const who of ['stays', 'leaves'] as const) {
      const asked = await clients[who]
        .from('group_requests')
        .insert({ group_id: groupId, requester_id: ids[who], status: 'pending' })
        .select('id')
        .single();
      if (asked.error) {
        throw new Error(`request seed failed: ${asked.error.message}`);
      }

      const approved = await clients.owner.rpc('rpc_approve_group_request', {
        p_request_id: asked.data.id,
      });
      if (approved.error) {
        throw new Error(`approval seed failed: ${approved.error.message}`);
      }
    }

    const upcoming = await admin
      .from('meetings')
      .insert({
        university_id: RUNI_ID,
        group_id: groupId,
        created_by: ids.owner,
        title: 'Weekly revision',
        starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        ends_at: new Date(Date.now() + 3 * 86_400_000 + 7_200_000).toISOString(),
      })
      .select('id')
      .single();
    if (upcoming.error) {
      throw new Error(`meeting seed failed: ${upcoming.error.message}`);
    }
    upcomingMeetingId = upcoming.data.id;

    const attendees = await admin.from('meeting_attendees').insert(
      Object.values(ids).map((id) => ({
        meeting_id: upcomingMeetingId,
        profile_id: id,
        rsvp: 'going' as const,
      })),
    );
    if (attendees.error) {
      throw new Error(`attendee seed failed: ${attendees.error.message}`);
    }

    finishedMeetingId = await seedCompletedMeeting(admin, {
      universityId: RUNI_ID,
      participants: [ids.owner, ids.leaves],
      groupId,
      title: 'Session that happened',
    });
  }, 90_000);

  afterAll(async () => {
    if (!hasLocalDb()) {
      return;
    }

    /* The group first — deleting its owner while they still administer it leaves
       the auth user behind and the next run trips over the duplicate name. */
    await admin.from('study_groups').delete().eq('id', groupId);
    await deleteStudents(admin, Object.values(ids));
  });

  it('starts with everyone in the group and at the session', async () => {
    expect(await going(upcomingMeetingId)).toHaveLength(3);
  });

  it('withdraws a departing member from the group’s upcoming sessions', async () => {
    const left = await clients.leaves
      .from('study_group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('profile_id', ids.leaves);

    expect(left.error).toBeNull();

    const attending = await going(upcomingMeetingId);

    /* Two members, two attendees. The "2 others coming" ghost is gone. */
    expect(attending).toHaveLength(2);
    expect(attending).not.toContain(ids.leaves);
  });

  it('leaves the people who are still in the group alone', async () => {
    const attending = await going(upcomingMeetingId);

    expect(attending).toContain(ids.owner);
    expect(attending).toContain(ids.stays);
  });

  it('does NOT touch a session that has already happened', async () => {
    /*
     * THE ASSERTION THAT MATTERS. This attendance is the evidence the rating
     * rule reads: both of them turned up and neither cancelled. If leaving the
     * group could erase it, somebody could destroy the record of a session they
     * sat through — and with it the other person's right to rate them.
     */
    const attending = await going(finishedMeetingId);

    expect(attending).toHaveLength(2);
    expect(attending).toContain(ids.leaves);
  });

  it('still lets them rate the person they actually studied with', async () => {
    /* The consequence of the rule above, checked end to end rather than implied. */
    const { error } = await clients.leaves
      .from('study_ratings')
      .insert({ rater_id: ids.leaves, ratee_id: ids.owner, sentiment: 'positive' });

    expect(error).toBeNull();
  });

  it('lets the departed member ask to join again', async () => {
    const { error } = await clients.leaves
      .from('group_requests')
      .insert({ group_id: groupId, requester_id: ids.leaves, status: 'pending' });

    expect(error).toBeNull();
  });
});
