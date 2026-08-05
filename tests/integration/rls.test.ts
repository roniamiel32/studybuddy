/**
 * File:        tests/integration/rls.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The security proof for StudyBuddy's multi-tenancy and privacy
 *              claims. Every test here runs as a REAL SIGNED-IN STUDENT, not
 *              the service role — the service role bypasses RLS, so a suite
 *              built on it would pass regardless of how the policies were
 *              written.
 *
 *              The tests are adversarial by design: each one takes the position
 *              of a student deliberately asking for data they should not have,
 *              and asserts they get nothing. A policy that merely "looks right"
 *              is not evidence; an attack that returns zero rows is.
 * Version:     0.5.0
 *
 * Modifications:
 *     0.5.0 - 2026-08-03 - Initial policy tests (Phase 1b)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';
import {
  RUNI_CURRENT_TERM_ID,
  RUNI_ID,
  TAU_ID,
  adminDb,
  anonDb,
  createStudent,
  deleteStudents,
  hasLocalDb,
  offeringIdByCode,
  signInAs,
  TEST_PASSWORD,
} from './helpers/db';

const describeDb = hasLocalDb() ? describe : describe.skip;

if (!hasLocalDb()) {
  console.warn(
    'Skipping RLS tests: run `npm run db:start` and populate .env.local.',
  );
}

/** Postgres "insufficient privilege" — what a blocked write returns. */
const RLS_DENIED = '42501';

describeDb('Row Level Security', () => {
  const admin = hasLocalDb() ? adminDb() : null!;
  const stamp = Math.random().toString(36).slice(2, 8);

  const emails = {
    /* Our protagonist: a Reichman student, signed in, probing for leaks. */
    runiSelf: `rls-self-${stamp}@post.runi.ac.il`,
    /* A discoverable Reichman classmate. */
    runiPeer: `rls-peer-${stamp}@post.runi.ac.il`,
    /* A Reichman student who switched discoverability off. */
    runiHidden: `rls-hidden-${stamp}@post.runi.ac.il`,
    /* The other tenant. Nothing about them may ever be visible. */
    tau: `rls-tau-${stamp}@mail.tau.ac.il`,
  };

  const ids: Record<keyof typeof emails, string> = {
    runiSelf: '',
    runiPeer: '',
    runiHidden: '',
    tau: '',
  };

  let self: SupabaseClient<Database>;
  let peer: SupabaseClient<Database>;
  let runiOfferingId = '';
  let tauOfferingId = '';

  beforeAll(async () => {
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      ids[key] = await createStudent(admin, emails[key]);
    }

    await admin.from('profiles').update({ is_discoverable: false }).eq('id', ids.runiHidden);

    // Phone numbers for everyone, so the contact-gating tests have something
    // real to fail to read.
    await admin.from('profile_contacts').insert([
      { profile_id: ids.runiPeer, phone_e164: '+972500000001' },
      { profile_id: ids.runiHidden, phone_e164: '+972500000002' },
      { profile_id: ids.tau, phone_e164: '+972500000003' },
    ]);

    await admin.from('availability_slots').insert([
      { profile_id: ids.runiPeer, day_of_week: 0, starts_at: '10:00', ends_at: '12:00' },
      { profile_id: ids.tau, day_of_week: 0, starts_at: '10:00', ends_at: '12:00' },
    ]);

    await admin.from('learning_preferences').insert([
      {
        profile_id: ids.tau,
        study_style: 'discussion',
        noise_preference: 'lively',
        place_preference: 'cafe',
        group_size_preference: 'pair',
        pace: 'on_track',
        goal: 'high_grade',
      },
    ]);

    runiOfferingId = await offeringIdByCode(admin, 'CS-3040', RUNI_CURRENT_TERM_ID);

    const { data: tauOffering } = await admin
      .from('course_offerings')
      .select('id, courses!inner(university_id)')
      .eq('courses.university_id', TAU_ID)
      .limit(1)
      .single();
    tauOfferingId = tauOffering!.id;

    await admin.from('enrollments').insert([
      { profile_id: ids.runiPeer, course_offering_id: runiOfferingId, university_id: RUNI_ID },
      { profile_id: ids.tau, course_offering_id: tauOfferingId, university_id: TAU_ID },
    ]);

    self = await signInAs(emails.runiSelf);
    peer = await signInAs(emails.runiPeer);
  }, 60_000);

  afterAll(async () => {
    await deleteStudents(admin, Object.values(ids));
  });

  // ===========================================================================
  // The headline claim: cross-tenant isolation.
  // ===========================================================================

  describe('a Reichman student cannot reach Tel Aviv University data', () => {
    it('sees only their own university in the course catalog', async () => {
      const { data, error } = await self.from('courses').select('id, university_id');

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThan(0);
      expect(data!.every((c) => c.university_id === RUNI_ID)).toBe(true);
      expect(data!.filter((c) => c.university_id === TAU_ID)).toHaveLength(0);
    });

    it('gets zero rows when asking for Tel Aviv courses by name', async () => {
      // Both tenants offer a course called "Data Structures". Asking by name is
      // exactly how a tenancy leak would surface.
      const { data } = await self
        .from('courses')
        .select('id, university_id, name')
        .eq('name', 'Data Structures');

      expect(data).toHaveLength(1);
      expect(data![0].university_id).toBe(RUNI_ID);
    });

    it('gets zero rows when asking for Tel Aviv courses by explicit id', async () => {
      const { data } = await self.from('courses').select('id').eq('university_id', TAU_ID);

      expect(data).toEqual([]);
    });

    it('sees only their own terms', async () => {
      const { data } = await self.from('terms').select('id, university_id');

      expect(data!.length).toBeGreaterThan(0);
      expect(data!.every((t) => t.university_id === RUNI_ID)).toBe(true);
    });

    it('cannot read a Tel Aviv course offering, even by its exact id', async () => {
      const { data } = await self.from('course_offerings').select('id').eq('id', tauOfferingId);

      expect(data).toEqual([]);
    });

    it('cannot read a Tel Aviv student profile, even by its exact id', async () => {
      const { data } = await self.from('profiles').select('id').eq('id', ids.tau);

      expect(data).toEqual([]);
    });

    it('cannot read a Tel Aviv student learning preferences', async () => {
      const { data } = await self
        .from('learning_preferences')
        .select('profile_id')
        .eq('profile_id', ids.tau);

      expect(data).toEqual([]);
    });

    it('cannot read a Tel Aviv student availability', async () => {
      const { data } = await self
        .from('availability_slots')
        .select('id')
        .eq('profile_id', ids.tau);

      expect(data).toEqual([]);
    });

    it('cannot read a Tel Aviv student enrollments', async () => {
      const { data } = await self.from('enrollments').select('id').eq('profile_id', ids.tau);

      expect(data).toEqual([]);
    });

    it('cannot enroll itself in a Tel Aviv course', async () => {
      const { error } = await self.from('enrollments').insert({
        profile_id: ids.runiSelf,
        course_offering_id: tauOfferingId,
        // Claiming the correct tenant does not help: the trigger overwrites
        // this from the offering, and the policy checks the derived value.
        university_id: RUNI_ID,
      });

      expect(error).not.toBeNull();
      expect(error!.code).toBe(RLS_DENIED);
    });

    it('cannot move itself into another institution', async () => {
      const { error } = await self
        .from('profiles')
        .update({ university_id: TAU_ID })
        .eq('id', ids.runiSelf);

      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/cannot move between institutions/i);
    });

    it('an unenumerable listing does not leak Tel Aviv rows either', async () => {
      // No filter at all — the broadest possible request.
      const { data } = await self.from('profiles').select('id, university_id');

      expect(data!.every((p) => p.university_id === RUNI_ID)).toBe(true);
      expect(data!.map((p) => p.id)).not.toContain(ids.tau);
    });
  });

  // ===========================================================================
  // Visibility within a tenant.
  // ===========================================================================

  describe('discoverability inside your own university', () => {
    it('can see a discoverable classmate', async () => {
      const { data } = await self.from('profiles').select('id').eq('id', ids.runiPeer);

      expect(data).toHaveLength(1);
    });

    it('cannot see a classmate who turned discoverability off', async () => {
      const { data } = await self.from('profiles').select('id').eq('id', ids.runiHidden);

      expect(data).toEqual([]);
    });

    it('cannot see a hidden classmate availability either', async () => {
      const { data } = await self
        .from('availability_slots')
        .select('id')
        .eq('profile_id', ids.runiHidden);

      expect(data).toEqual([]);
    });

    it('can always see itself', async () => {
      const { data } = await self.from('profiles').select('id').eq('id', ids.runiSelf);

      expect(data).toHaveLength(1);
    });

    it('cannot edit a classmate profile', async () => {
      const { data } = await self
        .from('profiles')
        .update({ full_name: 'Vandalised' })
        .eq('id', ids.runiPeer)
        .select();

      // The UPDATE matches no visible row, so it silently affects nothing.
      expect(data).toEqual([]);

      const { data: check } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', ids.runiPeer)
        .single();
      expect(check!.full_name).toBeNull();
    });

    it('cannot create a profile row belonging to someone else', async () => {
      const { error } = await self.from('profiles').insert({
        id: ids.runiHidden,
        university_id: RUNI_ID,
      });

      expect(error).not.toBeNull();
    });
  });

  // ===========================================================================
  // Phone numbers — the privacy claim behind decision D3.
  // ===========================================================================

  describe('phone numbers are gated behind an accepted connection', () => {
    it('cannot read a classmate phone number by default', async () => {
      const { data } = await self
        .from('profile_contacts')
        .select('phone_e164')
        .eq('profile_id', ids.runiPeer);

      expect(data).toEqual([]);
    });

    it('cannot read a Tel Aviv student phone number', async () => {
      const { data } = await self
        .from('profile_contacts')
        .select('phone_e164')
        .eq('profile_id', ids.tau);

      expect(data).toEqual([]);
    });

    it('can read its own', async () => {
      await admin
        .from('profile_contacts')
        .insert({ profile_id: ids.runiSelf, phone_e164: '+972509999999' });

      const { data } = await self.from('profile_contacts').select('phone_e164');

      expect(data).toHaveLength(1);
      expect(data![0].phone_e164).toBe('+972509999999');
    });

    it('a PENDING request grants no access — consent is the acceptance', async () => {
      const { data: request, error } = await self
        .from('connection_requests')
        .insert({
          requester_id: ids.runiSelf,
          addressee_id: ids.runiPeer,
          course_offering_id: runiOfferingId,
          university_id: RUNI_ID,
          icebreaker_text: 'Shall we go over the last problem set together?',
        })
        .select('id')
        .single();

      expect(error).toBeNull();

      const { data: contacts } = await self
        .from('profile_contacts')
        .select('phone_e164')
        .eq('profile_id', ids.runiPeer);

      expect(contacts).toEqual([]);

      // Clean up so later tests start from a known state.
      await admin.from('connection_requests').delete().eq('id', request!.id);
    });

    it('an ACCEPTED request grants access, in both directions', async () => {
      const { data: request } = await self
        .from('connection_requests')
        .insert({
          requester_id: ids.runiSelf,
          addressee_id: ids.runiPeer,
          course_offering_id: runiOfferingId,
          university_id: RUNI_ID,
        })
        .select('id')
        .single();

      // The addressee accepts, using their own session.
      const { error: acceptError } = await peer
        .from('connection_requests')
        .update({ status: 'accepted' })
        .eq('id', request!.id);
      expect(acceptError).toBeNull();

      const { data: requesterView } = await self
        .from('profile_contacts')
        .select('phone_e164')
        .eq('profile_id', ids.runiPeer);
      expect(requesterView).toHaveLength(1);

      const { data: addresseeView } = await peer
        .from('profile_contacts')
        .select('phone_e164')
        .eq('profile_id', ids.runiSelf);
      expect(addresseeView).toHaveLength(1);

      await admin.from('connection_requests').delete().eq('id', request!.id);
    });
  });

  // ===========================================================================
  // Request lifecycle (decision D2).
  // ===========================================================================

  describe('connection request transitions', () => {
    let requestId = '';

    beforeAll(async () => {
      const { data } = await admin
        .from('connection_requests')
        .insert({
          requester_id: ids.runiSelf,
          addressee_id: ids.runiPeer,
          course_offering_id: runiOfferingId,
          university_id: RUNI_ID,
          icebreaker_text: 'Original wording, written by the requester.',
        })
        .select('id')
        .single();
      requestId = data!.id;
    });

    afterAll(async () => {
      await admin.from('connection_requests').delete().eq('id', requestId);
    });

    it('an uninvolved student cannot read the request', async () => {
      const outsider = await signInAs(emails.runiHidden);
      const { data } = await outsider.from('connection_requests').select('id').eq('id', requestId);

      expect(data).toEqual([]);
    });

    it('the requester cannot accept their own request', async () => {
      const { error } = await self
        .from('connection_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);

      // The "requester may withdraw" policy lets them reach the row, but its
      // WITH CHECK permits only pending -> cancelled. Accepting is refused
      // outright rather than silently ignored, which is the better failure:
      // the caller learns the transition is not theirs to make.
      expect(error).not.toBeNull();
      expect(error!.code).toBe(RLS_DENIED);

      const { data: unchanged } = await admin
        .from('connection_requests')
        .select('status')
        .eq('id', requestId)
        .single();
      expect(unchanged!.status).toBe('pending');
    });

    it('the requester can withdraw their own request', async () => {
      const { data: fresh } = await admin
        .from('connection_requests')
        .insert({
          requester_id: ids.runiSelf,
          addressee_id: ids.runiHidden,
          course_offering_id: runiOfferingId,
          university_id: RUNI_ID,
        })
        .select('id')
        .single();

      const { error } = await self
        .from('connection_requests')
        .update({ status: 'cancelled' })
        .eq('id', fresh!.id);

      expect(error).toBeNull();

      await admin.from('connection_requests').delete().eq('id', fresh!.id);
    });

    it('the addressee cannot rewrite the icebreaker they were sent', async () => {
      const { error } = await peer
        .from('connection_requests')
        .update({ status: 'accepted', icebreaker_text: 'Something I never wrote.' })
        .eq('id', requestId);

      expect(error).not.toBeNull();
      expect(error!.message).toMatch(/cannot be edited after it is sent/i);
    });

    it('the addressee can decline', async () => {
      const { error } = await peer
        .from('connection_requests')
        .update({ status: 'declined' })
        .eq('id', requestId);

      expect(error).toBeNull();

      const { data } = await admin
        .from('connection_requests')
        .select('status')
        .eq('id', requestId)
        .single();
      expect(data!.status).toBe('declined');
    });
  });

  // ===========================================================================
  // Derived and private tables.
  // ===========================================================================

  describe('AI tables and blocks', () => {
    it('a student reads only their own match scores', async () => {
      await admin.from('match_scores').insert([
        {
          profile_id: ids.runiSelf,
          candidate_id: ids.runiPeer,
          course_offering_id: runiOfferingId,
          rule_score: 80,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
        {
          profile_id: ids.runiPeer,
          candidate_id: ids.runiSelf,
          course_offering_id: runiOfferingId,
          rule_score: 75,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        },
      ]);

      const { data } = await self.from('match_scores').select('profile_id');

      expect(data).toHaveLength(1);
      expect(data![0].profile_id).toBe(ids.runiSelf);
    });

    it('a student cannot forge a match score', async () => {
      const { error } = await self.from('match_scores').insert({
        profile_id: ids.runiSelf,
        candidate_id: ids.runiPeer,
        course_offering_id: runiOfferingId,
        rule_score: 100,
        ai_rank: 1,
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      });

      expect(error).not.toBeNull();
    });

    it('a student cannot write to the AI usage log, which would erase their rate limit', async () => {
      const { error } = await self.from('ai_generation_log').insert({
        profile_id: ids.runiSelf,
        task: 'match_rerank',
        model: 'test',
        status: 'ok',
      });

      expect(error).not.toBeNull();
      expect(error!.code).toBe(RLS_DENIED);
    });

    it('a blocked student cannot detect that they were blocked', async () => {
      await admin
        .from('blocked_users')
        .insert({ blocker_id: ids.runiPeer, blocked_id: ids.runiSelf });

      // The blocker sees their own entry.
      const { data: blockerView } = await peer.from('blocked_users').select('blocked_id');
      expect(blockerView).toHaveLength(1);

      // The blocked student sees nothing at all.
      const { data: blockedView } = await self.from('blocked_users').select('blocker_id');
      expect(blockedView).toEqual([]);
    });
  });

  // ===========================================================================
  // Unauthenticated access.
  // ===========================================================================

  describe('an anonymous visitor', () => {
    it('reads no student data at all', async () => {
      const anon = anonDb();

      for (const table of [
        'profiles',
        'profile_contacts',
        'availability_slots',
        'enrollments',
        'connection_requests',
        'match_scores',
      ] as const) {
        const { data, error } = await anon.from(table).select('*');
        // Either denied outright or filtered to nothing — never a row.
        expect(error ? true : data!.length === 0).toBe(true);
      }
    });

    it('reads no course catalog', async () => {
      const anon = anonDb();
      const { data, error } = await anon.from('courses').select('*');

      expect(error ? true : data!.length === 0).toBe(true);
    });

    it('cannot sign in with a guessed password', async () => {
      const anon = anonDb();
      const { error } = await anon.auth.signInWithPassword({
        email: emails.runiPeer,
        password: `${TEST_PASSWORD}-wrong`,
      });

      expect(error).not.toBeNull();
    });
  });
});
