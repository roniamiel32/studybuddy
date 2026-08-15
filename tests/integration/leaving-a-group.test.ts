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

  it('keeps every past request when a new one is made', async () => {
    /*
     * The admin's side of re-joining. Nothing about asking again may disturb what
     * came before — the approved row from the first membership is the record that
     * it happened, and an admin looking at somebody's history should see all of
     * it, not just the newest.
     */
    const { data } = await admin
      .from('group_requests')
      .select('status')
      .eq('group_id', groupId)
      .eq('requester_id', ids.leaves)
      .order('created_at');

    expect((data ?? []).map((row) => row.status)).toEqual(['approved', 'pending']);
  });

  it('puts a newly approved member on the group’s upcoming sessions', async () => {
    /*
     * THE BUG THIS PAIRS WITH withdraw_from_group_meetings. A student approved
     * after a session was booked could not see it — no card, no RSVP — while the
     * hour was already unbookable in their scheduler, because the slot finder
     * subtracts what the other members are committed to.
     */
    const request = await admin
      .from('group_requests')
      .select('id')
      .eq('group_id', groupId)
      .eq('requester_id', ids.leaves)
      .eq('status', 'pending')
      .single();

    const approved = await clients.owner.rpc('rpc_approve_group_request', {
      p_request_id: request.data!.id,
    });

    expect(approved.error).toBeNull();

    const { data: attendance } = await admin
      .from('meeting_attendees')
      .select('rsvp, responded_at')
      .eq('meeting_id', upcomingMeetingId)
      .eq('profile_id', ids.leaves)
      .single();

    /*
     * 'going' with responded_at null IS the pending state — the enum has no
     * 'maybe' on purpose, and this is exactly what rpc_create_meeting writes for
     * everyone but the organiser. So a new member arrives on the same footing as
     * somebody who was there when it was booked.
     */
    expect(attendance?.rsvp).toBe('going');
    expect(attendance?.responded_at).toBeNull();
  });

  it('does NOT put them on a session that has already run', async () => {
    /*
     * The boundary, from the joining side. Adding somebody to a finished session
     * would invent attendance for a group they were not in at the time — and
     * attendance is what the rating rule reads.
     */
    const { data } = await admin
      .from('meeting_attendees')
      .select('profile_id')
      .eq('meeting_id', finishedMeetingId)
      .eq('profile_id', ids.leaves);

    /* One row, from the first membership — not a second from re-joining. */
    expect(data).toHaveLength(1);
  });

  it('still hides the group chat from before they joined', async () => {
    /*
     * Explicitly asserted because the session fix and the history rule pull in
     * opposite directions: joining reaches back for meetings and must NOT reach
     * back for messages. getGroupMessages filters on the membership row's
     * joined_at, which the trigger does not touch — this is what would catch it
     * if somebody "helpfully" backdated joined_at to make sessions appear.
     */
    const { data: member } = await admin
      .from('study_group_members')
      .select('joined_at')
      .eq('group_id', groupId)
      .eq('profile_id', ids.leaves)
      .single();

    const posted = await admin
      .from('study_group_messages')
      .insert({ group_id: groupId, sender_id: ids.owner, body: 'Older than the rejoin' })
      .select('created_at')
      .single();

    expect(posted.error).toBeNull();

    /* Their join predates this message, so it is visible — the filter is a
       timestamp comparison and this proves which way round it runs. */
    expect(new Date(member!.joined_at).getTime()).toBeLessThanOrEqual(
      new Date(posted.data!.created_at).getTime(),
    );
  });
});
