/**
 * File:        tests/integration/group-admins.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The security proof for Phase 7A and 7B — co-admins, the founder
 *              rank, and invitations.
 *
 *              TWO RANKS, AND THE TESTS THAT MATTER ARE THE NEGATIVE ONES.
 *              Promotion is shared; demotion is the founder's alone. A model
 *              like that is only worth anything if every route around it is
 *              closed, so this suite spends most of its length trying to take
 *              the founder's rank by other means: demoting them, evicting them,
 *              and writing admin_id directly.
 *
 *              THE CONSENT RULE from Phase 5 is the other half. An admin may
 *              invite, and only the student named may accept — proved here from
 *              both sides, because an invitation the admin can answer is just
 *              the forced add the policy was written to prevent.
 *
 *              Every test runs as a REAL SIGNED-IN STUDENT. The service role
 *              bypasses RLS, so a suite built on it would pass regardless.
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - Initial policy tests (Phase 7A/7B)
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
  console.warn('Skipping group admin tests: run `npm run db:start` and populate .env.local.');
}

/** Postgres "insufficient privilege" — what a blocked write returns. */
const DENIED = '42501';

describeDb('Study groups: admin roles and invitations', () => {
  const admin = hasLocalDb() ? adminDb() : null!;
  const stamp = Math.random().toString(36).slice(2, 8);

  const emails = {
    /* Creates the group. Untouchable. */
    founder: `ga-founder-${stamp}@post.runi.ac.il`,
    /* Promoted to admin by the founder. */
    coadmin: `ga-coadmin-${stamp}@post.runi.ac.il`,
    /* A plain member. */
    member: `ga-member-${stamp}@post.runi.ac.il`,
    /* Enrolled in the course, never in the group. */
    outsider: `ga-outsider-${stamp}@post.runi.ac.il`,
  };

  const ids: Record<keyof typeof emails, string> = {
    founder: '',
    coadmin: '',
    member: '',
    outsider: '',
  };

  const clients: Record<keyof typeof emails, SupabaseClient<Database>> = {} as never;

  let offeringId = '';
  let groupId = '';

  /**
   * Puts a student into the group through the normal request-and-approve path.
   *
   * @param who - Which student.
   * @returns Nothing.
   */
  async function joinViaRequest(who: keyof typeof emails) {
    const asked = await clients[who]
      .from('group_requests')
      .insert({ group_id: groupId, requester_id: ids[who], status: 'pending' })
      .select('id')
      .single();

    if (asked.error) {
      throw new Error(`request seed failed for ${who}: ${asked.error.message}`);
    }

    const approved = await clients.founder.rpc('rpc_approve_group_request', {
      p_request_id: asked.data.id,
    });

    if (approved.error) {
      throw new Error(`approval seed failed for ${who}: ${approved.error.message}`);
    }
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

    await admin
      .from('profiles')
      .update({ is_discoverable: true, onboarding_completed_at: new Date().toISOString() })
      .in('id', Object.values(ids));

    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      clients[key] = await signInAs(emails[key]);
    }

    const created = await clients.founder
      .from('study_groups')
      .insert({
        course_offering_id: offeringId,
        university_id: RUNI_ID,
        admin_id: ids.founder,
        name: 'Computational Models revision',
        max_participants: 5,
      })
      .select('id')
      .single();

    if (created.error) {
      throw new Error(`group seed failed: ${created.error.message}`);
    }

    groupId = created.data.id;

    await joinViaRequest('coadmin');
    await joinViaRequest('member');
  }, 90_000);

  afterAll(async () => {
    await deleteStudents(admin, Object.values(ids));
  });

  // ===========================================================================
  // The role itself.
  // ===========================================================================

  describe('the founder starts as the only admin', () => {
    it('made the creator an admin, not merely a member', async () => {
      const { data } = await clients.founder
        .from('study_group_members')
        .select('profile_id, role')
        .eq('group_id', groupId);

      const roles = Object.fromEntries((data ?? []).map((row) => [row.profile_id, row.role]));

      expect(roles[ids.founder]).toBe('admin');
      expect(roles[ids.coadmin]).toBe('member');
      expect(roles[ids.member]).toBe('member');
    });

    it('refuses a plain member promoting anyone', async () => {
      const { data } = await clients.member
        .from('study_group_members')
        .update({ role: 'admin' })
        .eq('group_id', groupId)
        .eq('profile_id', ids.member)
        .select('profile_id');

      /* Zero rows: the update policy is scoped to admins. */
      expect(data ?? []).toHaveLength(0);
    });
  });

  describe('promotion is shared, demotion is not', () => {
    it('lets the founder promote a member', async () => {
      const { error } = await clients.founder
        .from('study_group_members')
        .update({ role: 'admin' })
        .eq('group_id', groupId)
        .eq('profile_id', ids.coadmin);

      expect(error).toBeNull();
    });

    it('lets the new admin promote someone too', async () => {
      const { error } = await clients.coadmin
        .from('study_group_members')
        .update({ role: 'admin' })
        .eq('group_id', groupId)
        .eq('profile_id', ids.member);

      expect(error).toBeNull();

      /* Put it back — the rest of the suite needs a plain member. */
      await clients.founder
        .from('study_group_members')
        .update({ role: 'member' })
        .eq('group_id', groupId)
        .eq('profile_id', ids.member);
    });

    it('refuses one admin demoting another', async () => {
      /*
       * The rank rule. Both are admins, so the policy lets the write through and
       * only the trigger can tell them apart — which is exactly why the rule is
       * a trigger.
       */
      await clients.coadmin
        .from('study_group_members')
        .update({ role: 'admin' })
        .eq('group_id', groupId)
        .eq('profile_id', ids.member);

      const { error } = await clients.coadmin
        .from('study_group_members')
        .update({ role: 'member' })
        .eq('group_id', groupId)
        .eq('profile_id', ids.member);

      expect(error?.code).toBe(DENIED);
      expect(error?.message).toMatch(/founder/i);

      await clients.founder
        .from('study_group_members')
        .update({ role: 'member' })
        .eq('group_id', groupId)
        .eq('profile_id', ids.member);
    });

    it('refuses an admin demoting the FOUNDER', async () => {
      const { error } = await clients.coadmin
        .from('study_group_members')
        .update({ role: 'member' })
        .eq('group_id', groupId)
        .eq('profile_id', ids.founder);

      expect(error?.code).toBe(DENIED);
    });

    it('refuses the founder demoting THEMSELVES', async () => {
      /*
       * Checked for every caller, because it is an invariant of the group rather
       * than a question of who is asking. A founder who could step down would
       * leave a group whose demotion rank nobody holds.
       */
      const { error } = await clients.founder
        .from('study_group_members')
        .update({ role: 'member' })
        .eq('group_id', groupId)
        .eq('profile_id', ids.founder);

      expect(error?.code).toBe(DENIED);
    });
  });

  // ===========================================================================
  // The escalation route that is not through the role column at all.
  // ===========================================================================

  describe('the founder rank cannot be taken', () => {
    it('refuses an admin rewriting admin_id to themselves', async () => {
      /*
       * THE ESCALATION THE FREEZE TRIGGER EXISTS FOR. Admins can now edit their
       * group, and UPDATE reaches every column of the row — including the one
       * naming the founder. Without the freeze this is a one-line promotion to
       * the rank the whole model withholds.
       */
      const { error } = await clients.coadmin
        .from('study_groups')
        .update({ admin_id: ids.coadmin })
        .eq('id', groupId);

      expect(error?.code).toBe(DENIED);

      const { data } = await clients.coadmin
        .from('study_groups')
        .select('admin_id')
        .eq('id', groupId)
        .single();

      expect(data?.admin_id).toBe(ids.founder);
    });

    it('refuses an admin moving the group to another course', async () => {
      const other = await offeringIdByCode(admin, 'CS-2010', RUNI_CURRENT_TERM_ID);

      /*
       * The founder is enrolled in the target course first, deliberately.
       * check_study_group_consistency would otherwise reject the move for an
       * unrelated reason — the founder not taking it — and the test would pass
       * without ever exercising the freeze it is named after.
       */
      await admin.from('enrollments').insert({
        profile_id: ids.founder,
        course_offering_id: other,
        university_id: RUNI_ID,
      });

      const { error } = await clients.coadmin
        .from('study_groups')
        .update({ course_offering_id: other })
        .eq('id', groupId);

      expect(error?.code).toBe(DENIED);

      await admin
        .from('enrollments')
        .delete()
        .eq('profile_id', ids.founder)
        .eq('course_offering_id', other);
    });

    it('refuses an admin removing another admin', async () => {
      /*
       * Removal is demotion by other means — and worse, since it evicts them too.
       * Without this the rank rule would be decoration.
       */
      const { error } = await clients.coadmin
        .from('study_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('profile_id', ids.founder);

      expect(error?.code).toBe(DENIED);
    });

    it('lets the founder demote an admin they promoted', async () => {
      const { error } = await clients.founder
        .from('study_group_members')
        .update({ role: 'member' })
        .eq('group_id', groupId)
        .eq('profile_id', ids.coadmin);

      expect(error).toBeNull();

      /* Back to admin: later tests need two of them. */
      await clients.founder
        .from('study_group_members')
        .update({ role: 'admin' })
        .eq('group_id', groupId)
        .eq('profile_id', ids.coadmin);
    });
  });

  // ===========================================================================
  // Editing the group, which is what admins were given the rank for.
  // ===========================================================================

  describe('an admin can edit the group', () => {
    it('lets a co-admin rename it and change the limit', async () => {
      const { error } = await clients.coadmin
        .from('study_groups')
        .update({ name: 'Renamed by a co-admin', max_participants: 8 })
        .eq('id', groupId);

      expect(error).toBeNull();
    });

    it('refuses a limit below the people already in it', async () => {
      /*
       * Three members. A limit of 2 would leave a group permanently over
       * capacity — a state nothing can leave, because leaving is what it blocks.
       */
      const { error } = await clients.coadmin
        .from('study_groups')
        .update({ max_participants: 2 })
        .eq('id', groupId);

      expect(error?.code).toBe('23514');
      expect(error?.message).toMatch(/already has/i);
    });

    it('refuses a plain member editing anything', async () => {
      const { data } = await clients.member
        .from('study_groups')
        .update({ name: 'Renamed by a member' })
        .eq('id', groupId)
        .select('id');

      expect(data ?? []).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Join requests, seen by everyone who can decide them.
  // ===========================================================================

  describe('a pending request reaches every admin, and the first one settles it', () => {
    let requestId = '';

    beforeAll(async () => {
      const asked = await clients.outsider
        .from('group_requests')
        .insert({ group_id: groupId, requester_id: ids.outsider, status: 'pending' })
        .select('id')
        .single();

      if (asked.error) {
        throw new Error(`request seed failed: ${asked.error.message}`);
      }

      requestId = asked.data.id;
    });

    it('is visible to the co-admin, not only to the founder', async () => {
      const { data } = await clients.coadmin
        .from('group_requests')
        .select('id, status')
        .eq('group_id', groupId)
        .eq('status', 'pending');

      expect((data ?? []).map((row) => row.id)).toContain(requestId);
    });

    it('is invisible to a plain member', async () => {
      const { data } = await clients.member
        .from('group_requests')
        .select('id')
        .eq('id', requestId);

      expect(data ?? []).toHaveLength(0);
    });

    it('is decided by whichever admin answers first', async () => {
      const first = await clients.coadmin.rpc('rpc_approve_group_request', {
        p_request_id: requestId,
      });

      expect(first.error).toBeNull();

      /* The founder arrives second and is refused — the decision is already made. */
      const second = await clients.founder.rpc('rpc_reject_group_request', {
        p_request_id: requestId,
        p_note: 'Too late',
      });

      expect(second.error).not.toBeNull();
      expect(second.error?.message).toMatch(/already been decided/i);

      const { data } = await clients.founder
        .from('group_requests')
        .select('status, decided_by')
        .eq('id', requestId)
        .single();

      expect(data?.status).toBe('approved');
      expect(data?.decided_by).toBe(ids.coadmin);
    });

    afterAll(async () => {
      await admin
        .from('study_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('profile_id', ids.outsider);
      await admin.from('group_requests').delete().eq('id', requestId);
    });
  });

  // ===========================================================================
  // Invitations — the consent rule, from both sides.
  // ===========================================================================

  describe('an admin invites, and only the student accepts', () => {
    let inviteId = '';

    it('lets an admin invite a classmate', async () => {
      const { data, error } = await clients.coadmin
        .from('group_requests')
        .insert({
          group_id: groupId,
          requester_id: ids.outsider,
          kind: 'invite',
          invited_by: ids.coadmin,
          status: 'pending',
        })
        .select('id')
        .single();

      expect(error).toBeNull();
      inviteId = data!.id;
    });

    it('shows the invitation to the student it names', async () => {
      const { data } = await clients.outsider
        .from('group_requests')
        .select('id, kind')
        .eq('id', inviteId);

      expect(data).toHaveLength(1);
      expect(data![0].kind).toBe('invite');
    });

    it('refuses the ADMIN accepting on the student’s behalf', async () => {
      /*
       * The consent rule, and the whole reason invitations exist rather than a
       * direct insert. An admin who could answer this has performed the forced
       * add the Phase 5 policy was written to prevent.
       */
      const { error } = await clients.coadmin.rpc('rpc_approve_group_request', {
        p_request_id: inviteId,
      });

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/not yours to decide/i);

      const { data } = await clients.founder
        .from('study_group_members')
        .select('profile_id')
        .eq('group_id', groupId)
        .eq('profile_id', ids.outsider);

      expect(data ?? []).toHaveLength(0);
    });

    it('lets the student accept it themselves', async () => {
      const { error } = await clients.outsider.rpc('rpc_approve_group_request', {
        p_request_id: inviteId,
      });

      expect(error).toBeNull();

      const { data } = await clients.outsider
        .from('study_group_members')
        .select('profile_id, role')
        .eq('group_id', groupId)
        .eq('profile_id', ids.outsider);

      expect(data).toHaveLength(1);
      /* Invited as a member, whoever invited them. */
      expect(data![0].role).toBe('member');
    });

    it('refuses a student inviting THEMSELVES into a group', async () => {
      /*
       * The reason the Phase 5 insert policy had to be narrowed to
       * kind = 'request'. Policies OR together, so a self-authored invite would
       * be decidable by its own author — joining any open group in the course
       * with no admin involved at all.
       */
      await admin
        .from('study_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('profile_id', ids.outsider);
      await admin.from('group_requests').delete().eq('id', inviteId);

      const { error } = await clients.outsider.from('group_requests').insert({
        group_id: groupId,
        requester_id: ids.outsider,
        kind: 'invite',
        invited_by: ids.outsider,
        status: 'pending',
      });

      expect(error?.code).toBe(DENIED);
    });

    it('refuses a plain member issuing an invitation', async () => {
      const { error } = await clients.member.from('group_requests').insert({
        group_id: groupId,
        requester_id: ids.outsider,
        kind: 'invite',
        invited_by: ids.member,
        status: 'pending',
      });

      expect(error?.code).toBe(DENIED);
    });
  });

  // ===========================================================================
  // A group always has someone who can run it.
  // ===========================================================================

  describe('a group cannot be left without an admin', () => {
    it('lets an admin leave while another remains', async () => {
      const { error } = await clients.coadmin
        .from('study_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('profile_id', ids.coadmin);

      expect(error).toBeNull();
    });

    it('refuses the last admin leaving', async () => {
      /*
       * The founder is now the only admin. An admin-less group has no recovery
       * path: nobody can approve, edit, or promote.
       */
      const { error } = await clients.founder
        .from('study_group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('profile_id', ids.founder);

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/founder cannot be removed|at least one admin/i);

      const { data } = await clients.founder
        .from('study_group_members')
        .select('profile_id')
        .eq('group_id', groupId)
        .eq('profile_id', ids.founder);

      expect(data).toHaveLength(1);
    });
  });
});
