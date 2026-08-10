/**
 * File:        tests/integration/groups-rls.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The security proof for Phase 5's study groups.
 *
 *              Three lines to defend, and this suite attacks each of them:
 *                1. A group is DISCOVERABLE by its class, so the class can find it.
 *                2. Its CHAT is members-only, so the class cannot read it.
 *                3. Only the admin decides who joins — and cannot add someone who
 *                   never asked.
 *
 *              The third is the one worth the most attention. `rpc_approve_group_
 *              request` is SECURITY DEFINER, which means RLS does not apply inside
 *              it and its own WHERE clause is the only thing stopping any student
 *              approving anyone into any group.
 *
 *              Every test runs as a REAL SIGNED-IN STUDENT. The service role
 *              bypasses RLS, so a suite built on it would pass regardless.
 * Version:     0.15.0
 *
 * Modifications:
 *     0.15.0 - 2026-08-10 - Initial policy tests (Phase 5)
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
  console.warn('Skipping group RLS tests: run `npm run db:start` and populate .env.local.');
}

/** Postgres "insufficient privilege" — what a blocked write returns. */
const RLS_DENIED = '42501';

describeDb('Study groups: Row Level Security', () => {
  const admin = hasLocalDb() ? adminDb() : null!;
  const stamp = Math.random().toString(36).slice(2, 8);

  const emails = {
    /* Creates the group and decides who joins. */
    owner: `grp-owner-${stamp}@post.runi.ac.il`,
    /* Takes the course and wants in. */
    joiner: `grp-joiner-${stamp}@post.runi.ac.il`,
    /* Takes the course, not in the group. Can see it exists, nothing more. */
    classmate: `grp-classmate-${stamp}@post.runi.ac.il`,
    /* Same university, DIFFERENT course. Should not see the group at all. */
    stranger: `grp-stranger-${stamp}@post.runi.ac.il`,
  };

  const ids: Record<keyof typeof emails, string> = {
    owner: '',
    joiner: '',
    classmate: '',
    stranger: '',
  };

  let owner: SupabaseClient<Database>;
  let joiner: SupabaseClient<Database>;
  let classmate: SupabaseClient<Database>;
  let stranger: SupabaseClient<Database>;

  let groupId = '';
  let offeringId = '';
  let otherOfferingId = '';

  beforeAll(async () => {
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      ids[key] = await createStudent(admin, emails[key]);
    }

    offeringId = await offeringIdByCode(admin, 'CS-3040', RUNI_CURRENT_TERM_ID);
    otherOfferingId = await offeringIdByCode(admin, 'CS-2010', RUNI_CURRENT_TERM_ID);

    /*
     * Three in the course, one deliberately elsewhere.
     *
     * Checked, not fire-and-forget. An unchecked seed is how a security suite goes
     * vacuous: with no enrolments the group insert is refused for the RIGHT reason
     * by the wrong cause, and every "cannot see it" test below would pass because
     * nothing existed to see.
     */
    const seeded = await admin.from('enrollments').insert([
      { profile_id: ids.owner, course_offering_id: offeringId, university_id: RUNI_ID },
      { profile_id: ids.joiner, course_offering_id: offeringId, university_id: RUNI_ID },
      { profile_id: ids.classmate, course_offering_id: offeringId, university_id: RUNI_ID },
      { profile_id: ids.stranger, course_offering_id: otherOfferingId, university_id: RUNI_ID },
    ]);

    if (seeded.error) {
      throw new Error(`enrolment seed failed: ${seeded.error.message}`);
    }

    owner = await signInAs(emails.owner);
    joiner = await signInAs(emails.joiner);
    classmate = await signInAs(emails.classmate);
    stranger = await signInAs(emails.stranger);

    /* Created as the owner, so the insert policy and the consistency trigger both
       run for real. */
    const created = await owner
      .from('study_groups')
      .insert({
        course_offering_id: offeringId,
        university_id: RUNI_ID,
        admin_id: ids.owner,
        name: 'Midterm revision',
        max_participants: 3,
      })
      .select('id')
      .single();

    if (created.error) {
      throw new Error(`group seed failed: ${created.error.message}`);
    }

    groupId = created.data.id;
  }, 90_000);

  afterAll(async () => {
    await deleteStudents(admin, Object.values(ids));
  });

  // ===========================================================================
  // Creation
  // ===========================================================================

  describe('creating a group', () => {
    it('adds the creator as a member automatically', async () => {
      /* Otherwise a group could exist whose admin is not in it, and every member
         count and chat policy would have to tolerate that. */
      const { data } = await owner
        .from('study_group_members')
        .select('profile_id')
        .eq('group_id', groupId);

      expect(data).toHaveLength(1);
      expect(data![0].profile_id).toBe(ids.owner);
    });

    it('refuses a group in a course you do not take', async () => {
      const { error } = await stranger.from('study_groups').insert({
        course_offering_id: offeringId,
        university_id: RUNI_ID,
        admin_id: ids.stranger,
        name: 'Gatecrashing',
        max_participants: 4,
      });

      expect(error).not.toBeNull();
    });

    it('refuses a group you would not administer', async () => {
      /* Naming someone else as admin would let a student create groups in another
         person's name. */
      const { error } = await joiner.from('study_groups').insert({
        course_offering_id: offeringId,
        university_id: RUNI_ID,
        admin_id: ids.owner,
        name: 'Not mine to make',
        max_participants: 4,
      });

      expect(error?.code).toBe(RLS_DENIED);
    });

    it('refuses a size outside the allowed range', async () => {
      const tooSmall = await owner.from('study_groups').insert({
        course_offering_id: offeringId,
        university_id: RUNI_ID,
        admin_id: ids.owner,
        name: 'Just me',
        max_participants: 1,
      });

      expect(tooSmall.error).not.toBeNull();
    });
  });

  // ===========================================================================
  // Discovery versus privacy — the central distinction.
  // ===========================================================================

  describe('who can see a group', () => {
    it('shows it to the class', async () => {
      const { data } = await classmate.from('study_groups').select('id').eq('id', groupId);

      /* Discovery is the feature: a group nobody can find has nobody to join it. */
      expect(data).toHaveLength(1);
    });

    it('shows the member list to the class, for the "2 of 3" count', async () => {
      const { data } = await classmate
        .from('study_group_members')
        .select('profile_id')
        .eq('group_id', groupId);

      expect(data!.length).toBeGreaterThan(0);
    });

    it('hides it from a student in a different course', async () => {
      const { data } = await stranger.from('study_groups').select('id').eq('id', groupId);

      expect(data).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Requests
  // ===========================================================================

  describe('asking to join', () => {
    let requestId = '';

    it('lets a classmate ask', async () => {
      const { data, error } = await joiner
        .from('group_requests')
        .insert({ group_id: groupId, requester_id: ids.joiner, status: 'pending' })
        .select('id')
        .single();

      expect(error).toBeNull();
      requestId = data!.id;
    });

    it('refuses a second live request from the same student', async () => {
      const { error } = await joiner
        .from('group_requests')
        .insert({ group_id: groupId, requester_id: ids.joiner, status: 'pending' });

      /* The one-live-request index. Nobody queues two. */
      expect(error).not.toBeNull();
    });

    it('refuses a request made in someone else’s name', async () => {
      const { error } = await classmate
        .from('group_requests')
        .insert({ group_id: groupId, requester_id: ids.joiner, status: 'pending' });

      expect(error?.code).toBe(RLS_DENIED);
    });

    it('refuses a request from outside the course', async () => {
      const { error } = await stranger
        .from('group_requests')
        .insert({ group_id: groupId, requester_id: ids.stranger, status: 'pending' });

      expect(error?.code).toBe(RLS_DENIED);
    });

    it('is visible to the requester and the admin, and nobody else', async () => {
      const asRequester = await joiner.from('group_requests').select('id').eq('id', requestId);
      const asAdmin = await owner.from('group_requests').select('id').eq('id', requestId);
      const asClassmate = await classmate.from('group_requests').select('id').eq('id', requestId);

      expect(asRequester.data).toHaveLength(1);
      expect(asAdmin.data).toHaveLength(1);
      /* A join request is between the two people it concerns. */
      expect(asClassmate.data).toHaveLength(0);
    });

    it('refuses a non-admin deciding it', async () => {
      const { data } = await classmate
        .from('group_requests')
        .update({ status: 'approved' })
        .eq('id', requestId)
        .select('id');

      /* Zero rows: the row is invisible to them, so there is nothing to update. */
      expect(data ?? []).toHaveLength(0);
    });

    it('refuses the requester approving themselves', async () => {
      const { data } = await joiner
        .from('group_requests')
        .update({ status: 'approved' })
        .eq('id', requestId)
        .select('id');

      /* They can READ their own request but the update policy is admin-only, so
         the row falls outside USING and nothing changes. */
      expect(data ?? []).toHaveLength(0);

      const { data: after } = await owner
        .from('group_requests')
        .select('status')
        .eq('id', requestId)
        .single();
      expect(after!.status).toBe('pending');
    });
  });

  // ===========================================================================
  // Membership — the rule that protects consent.
  // ===========================================================================

  describe('adding members', () => {
    it('refuses the admin adding someone who never asked', async () => {
      /*
       * The consent rule. Without the approved-request check in the policy, an
       * admin could sweep any classmate into a group they never applied to.
       */
      const { error } = await owner
        .from('study_group_members')
        .insert({ group_id: groupId, profile_id: ids.classmate });

      expect(error?.code).toBe(RLS_DENIED);
    });

    it('refuses a classmate adding themselves', async () => {
      const { error } = await classmate
        .from('study_group_members')
        .insert({ group_id: groupId, profile_id: ids.classmate });

      expect(error?.code).toBe(RLS_DENIED);
    });
  });

  // ===========================================================================
  // Approval, which is SECURITY DEFINER and therefore restates its own rules.
  // ===========================================================================

  describe('rpc_approve_group_request', () => {
    let requestId = '';

    beforeAll(async () => {
      const { data } = await owner
        .from('group_requests')
        .select('id')
        .eq('group_id', groupId)
        .eq('requester_id', ids.joiner)
        .eq('status', 'pending')
        .single();

      requestId = data!.id;
    });

    it('refuses a caller who is not the group admin', async () => {
      /*
       * THE test for this function. Definer rights bypass every policy above, so
       * the `g.admin_id = auth.uid()` line in its WHERE clause is the only thing
       * standing between any signed-in student and approving anyone into any group.
       */
      const { error } = await classmate.rpc('rpc_approve_group_request', {
        p_request_id: requestId,
      });

      expect(error).not.toBeNull();
    });

    it('refuses the requester approving themselves through it', async () => {
      const { error } = await joiner.rpc('rpc_approve_group_request', {
        p_request_id: requestId,
      });

      expect(error).not.toBeNull();
    });

    it('approves, adds the member and posts the welcome message, all at once', async () => {
      const { error } = await owner.rpc('rpc_approve_group_request', {
        p_request_id: requestId,
      });

      expect(error).toBeNull();

      const request = await owner
        .from('group_requests')
        .select('status, decided_by')
        .eq('id', requestId)
        .single();
      expect(request.data!.status).toBe('approved');
      expect(request.data!.decided_by).toBe(ids.owner);

      const members = await owner
        .from('study_group_members')
        .select('profile_id')
        .eq('group_id', groupId);
      expect(members.data!.map((row) => row.profile_id)).toContain(ids.joiner);

      /* The system message, and it is a system message: no sender. */
      const messages = await owner
        .from('study_group_messages')
        .select('body, is_system, sender_id')
        .eq('group_id', groupId)
        .eq('is_system', true);

      expect(messages.data).toHaveLength(1);
      expect(messages.data![0].body).toMatch(/^Welcome .+ to the group!$/);
      expect(messages.data![0].sender_id).toBeNull();
    });

    it('refuses re-deciding an already decided request', async () => {
      /* The freeze trigger. A decision is final, so nobody can flip someone in and
         out of a group by pressing a button twice. */
      const { error } = await owner
        .from('group_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId);

      expect(error?.code).toBe(RLS_DENIED);
    });
  });

  // ===========================================================================
  // The chat — members only.
  // ===========================================================================

  describe('the group chat', () => {
    beforeAll(async () => {
      const { error } = await owner.from('study_group_messages').insert({
        group_id: groupId,
        sender_id: ids.owner,
        body: 'Shall we meet Thursday at six?',
      });

      if (error) {
        throw new Error(`group message seed failed: ${error.message}`);
      }
    });

    it('lets members read it', async () => {
      const asOwner = await owner.from('study_group_messages').select('id').eq('group_id', groupId);
      const asJoiner = await joiner
        .from('study_group_messages')
        .select('id')
        .eq('group_id', groupId);

      expect(asOwner.data!.length).toBeGreaterThan(0);
      expect(asJoiner.data!.length).toBeGreaterThan(0);
    });

    it('hides it from a classmate who can see the group but is not in it', async () => {
      /*
       * The line the whole feature turns on: the class can see that a group
       * exists, and cannot read what its members say to each other.
       */
      const { data, error } = await classmate
        .from('study_group_messages')
        .select('id, body')
        .eq('group_id', groupId);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('refuses a non-member posting', async () => {
      const { error } = await classmate.from('study_group_messages').insert({
        group_id: groupId,
        sender_id: ids.classmate,
        body: 'Let me in',
      });

      expect(error?.code).toBe(RLS_DENIED);
    });

    it('refuses a member forging a message as someone else', async () => {
      const { error } = await joiner.from('study_group_messages').insert({
        group_id: groupId,
        sender_id: ids.owner,
        body: 'Everyone is welcome, signed the admin',
      });

      expect(error?.code).toBe(RLS_DENIED);
    });

    it('refuses a member forging a SYSTEM message', async () => {
      /*
       * A system message looks official. Without `not is_system` in the policy a
       * member could fake "Welcome X to the group!" and imply a decision the admin
       * never made.
       */
      const { error } = await joiner.from('study_group_messages').insert({
        group_id: groupId,
        sender_id: null,
        body: 'Welcome everybody to the group!',
        is_system: true,
      });

      expect(error?.code).toBe(RLS_DENIED);
    });
  });

  // ===========================================================================
  // Capacity, and leaving.
  // ===========================================================================

  describe('capacity and leaving', () => {
    it('refuses a member beyond max_participants', async () => {
      /* The group holds three: owner, joiner, and one more. Fill it, then try again. */
      const third = await createStudent(admin, `grp-third-${stamp}@post.runi.ac.il`);
      const fourth = await createStudent(admin, `grp-fourth-${stamp}@post.runi.ac.il`);

      await admin.from('enrollments').insert([
        { profile_id: third, course_offering_id: offeringId, university_id: RUNI_ID },
        { profile_id: fourth, course_offering_id: offeringId, university_id: RUNI_ID },
      ]);

      const thirdClient = await signInAs(`grp-third-${stamp}@post.runi.ac.il`);
      const fourthClient = await signInAs(`grp-fourth-${stamp}@post.runi.ac.il`);

      const thirdRequest = await thirdClient
        .from('group_requests')
        .insert({ group_id: groupId, requester_id: third, status: 'pending' })
        .select('id')
        .single();
      const fourthRequest = await fourthClient
        .from('group_requests')
        .insert({ group_id: groupId, requester_id: fourth, status: 'pending' })
        .select('id')
        .single();

      /* Third fills the group. */
      const filled = await owner.rpc('rpc_approve_group_request', {
        p_request_id: thirdRequest.data!.id,
      });
      expect(filled.error).toBeNull();

      /*
       * Fourth cannot get in, and the whole approval rolls back — which is the
       * reason approval is one function rather than three statements. The request
       * must still be pending afterwards, not approved-without-membership.
       */
      const overflowing = await owner.rpc('rpc_approve_group_request', {
        p_request_id: fourthRequest.data!.id,
      });
      expect(overflowing.error).not.toBeNull();

      const after = await owner
        .from('group_requests')
        .select('status')
        .eq('id', fourthRequest.data!.id)
        .single();
      expect(after.data!.status).toBe('pending');

      const members = await owner
        .from('study_group_members')
        .select('profile_id')
        .eq('group_id', groupId);
      expect(members.data).toHaveLength(3);

      await deleteStudents(admin, [third, fourth]);
    }, 60_000);

    it('lets a member leave, but not the admin', async () => {
      const asAdmin = await owner
        .from('study_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('profile_id', ids.owner)
        .select('profile_id');

      /* Leaving would orphan the group, so the delete policy excludes the admin. */
      expect(asAdmin.data ?? []).toHaveLength(0);

      const asMember = await joiner
        .from('study_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('profile_id', ids.joiner)
        .select('profile_id');

      expect(asMember.data).toHaveLength(1);
    });
  });
});
