/**
 * File:        tests/integration/matching.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Tests for the matching engine.
 *
 *              `rpc_find_candidates` runs as SECURITY DEFINER, which means the
 *              Row Level Security that protects every other read does NOT apply
 *              to it — every access rule is restated in its WHERE clause
 *              instead. That makes these tests the only thing standing between
 *              a mistake in that clause and a cross-tenant leak, so they are
 *              written adversarially and each runs as a real signed-in student.
 * Version:     0.8.0
 *
 * Modifications:
 *     0.8.0 - 2026-08-05 - Initial tests (Phase 2)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';
import {
  RUNI_CURRENT_TERM_ID,
  RUNI_ID,
  TAU_ID,
  adminDb,
  createStudent,
  deleteStudents,
  hasLocalDb,
  offeringIdByCode,
  signInAs,
} from './helpers/db';

const describeDb = hasLocalDb() ? describe : describe.skip;

if (!hasLocalDb()) {
  console.warn('Skipping matching tests: run `npm run db:start` and populate .env.local.');
}

describeDb('matching engine', () => {
  const admin = hasLocalDb() ? adminDb() : null!;
  const stamp = Math.random().toString(36).slice(2, 8);

  const emails = {
    /* Our viewer. */
    self: `match-self-${stamp}@post.runi.ac.il`,
    /* Strong candidate: identical preferences, generous overlap. */
    strong: `match-strong-${stamp}@post.runi.ac.il`,
    /* Weak candidate: same course, nothing else in common. */
    weak: `match-weak-${stamp}@post.runi.ac.il`,
    /* Same course and preferences, but not discoverable. */
    hidden: `match-hidden-${stamp}@post.runi.ac.il`,
    /* Another tenant entirely. */
    tau: `match-tau-${stamp}@mail.tau.ac.il`,
  };

  const ids: Record<keyof typeof emails, string> = {
    self: '',
    strong: '',
    weak: '',
    hidden: '',
    tau: '',
  };

  let self: SupabaseClient<Database>;
  let sharedOffering = '';
  let otherOffering = '';
  let tauOffering = '';

  /**
   * Makes a student fully matchable.
   *
   * @param id        - Their profile id.
   * @param options   - Preferences, availability and enrolments.
   * @returns Nothing.
   */
  async function completeProfile(
    id: string,
    options: {
      name: string;
      times: string[];
      envs: string[];
      groups: string[];
      saturday: boolean;
      languages: string[];
      slots: Array<[number, string, string]>;
      offerings: string[];
      discoverable?: boolean;
      universityId: string;
    },
  ) {
    const profile = await admin
      .from('profiles')
      .update({
        full_name: options.name,
        year_of_study: 2,
        is_discoverable: options.discoverable ?? true,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (profile.error) throw new Error(`${options.name} profile: ${profile.error.message}`);

    const prefs = await admin.from('learning_preferences').insert({
      profile_id: id,
      preferred_time_blocks: options.times as never,
      study_environments: options.envs as never,
      group_sizes: options.groups as never,
      studies_on_saturday: options.saturday,
      spoken_languages: options.languages,
    });
    if (prefs.error) throw new Error(`${options.name} prefs: ${prefs.error.message}`);

    if (options.slots.length > 0) {
      const slots = await admin.from('availability_slots').insert(
        options.slots.map(([day, start, end]) => ({
          profile_id: id,
          day_of_week: day,
          starts_at: start,
          ends_at: end,
        })),
      );
      if (slots.error) throw new Error(`${options.name} slots: ${slots.error.message}`);
    }

    const enrolments = await admin.from('enrollments').insert(
      options.offerings.map((offeringId) => ({
        profile_id: id,
        course_offering_id: offeringId,
        university_id: options.universityId,
      })),
    );
    if (enrolments.error) throw new Error(`${options.name} enrol: ${enrolments.error.message}`);
  }

  beforeAll(async () => {
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      ids[key] = await createStudent(admin, emails[key]);
    }

    sharedOffering = await offeringIdByCode(admin, 'CS-3040', RUNI_CURRENT_TERM_ID);
    otherOffering = await offeringIdByCode(admin, 'CS-1001', RUNI_CURRENT_TERM_ID);

    const { data: tauRow } = await admin
      .from('course_offerings')
      .select('id, courses!inner(university_id)')
      .eq('courses.university_id', TAU_ID)
      .limit(1)
      .single();
    tauOffering = tauRow!.id;

    const morningQuiet = {
      times: ['morning'],
      envs: ['quiet'],
      groups: ['small'],
      saturday: false,
      languages: ['he'],
      universityId: RUNI_ID,
    };

    await completeProfile(ids.self, {
      ...morningQuiet,
      name: 'Self Viewer',
      slots: [
        [0, '10:00', '14:00'],
        [2, '10:00', '14:00'],
      ],
      offerings: [sharedOffering],
    });

    await completeProfile(ids.strong, {
      ...morningQuiet,
      name: 'Strong Candidate',
      slots: [
        [0, '10:00', '14:00'],
        [2, '10:00', '14:00'],
      ],
      offerings: [sharedOffering],
    });

    await completeProfile(ids.weak, {
      name: 'Weak Candidate',
      times: ['evening'],
      envs: ['discussion'],
      groups: ['large'],
      saturday: true,
      languages: ['fr'],
      universityId: RUNI_ID,
      slots: [[5, '20:00', '22:00']],
      offerings: [sharedOffering],
    });

    await completeProfile(ids.hidden, {
      ...morningQuiet,
      name: 'Hidden Candidate',
      slots: [[0, '10:00', '14:00']],
      offerings: [sharedOffering],
      discoverable: false,
    });

    await completeProfile(ids.tau, {
      ...morningQuiet,
      name: 'Other Tenant',
      universityId: TAU_ID,
      slots: [[0, '10:00', '14:00']],
      offerings: [tauOffering],
    });

    self = await signInAs(emails.self);
  }, 90_000);

  afterAll(async () => {
    await deleteStudents(admin, Object.values(ids));
  });

  /**
   * Calls the RPC as the signed-in viewer.
   *
   * @param offeringId - Optional course filter.
   * @returns The returned rows.
   */
  async function findCandidates(offeringId?: string) {
    const { data, error } = await self.rpc('rpc_find_candidates', {
      p_course_offering_id: offeringId,
      p_limit: 50,
    });

    expect(error).toBeNull();
    return data ?? [];
  }

  describe('ranking', () => {
    it('ranks a well-matched classmate above a poorly-matched one', async () => {
      const rows = await findCandidates();
      const strong = rows.find((row) => row.candidate_id === ids.strong);
      const weak = rows.find((row) => row.candidate_id === ids.weak);

      expect(strong).toBeDefined();
      expect(weak).toBeDefined();
      expect(Number(strong!.rule_score)).toBeGreaterThan(Number(weak!.rule_score));
    });

    it('gives an identical partner a high score and the mismatch a low one', async () => {
      const rows = await findCandidates();
      const strong = rows.find((row) => row.candidate_id === ids.strong)!;
      const weak = rows.find((row) => row.candidate_id === ids.weak)!;

      // Same preferences and 8h of overlap: everything except the intent bonus.
      expect(Number(strong!.rule_score)).toBeGreaterThanOrEqual(70);
      // Opposite on every axis and no shared hours, but still the same course.
      expect(Number(weak!.rule_score)).toBeLessThan(20);
    });

    it('reports the shared weekdays, not just a total', async () => {
      const rows = await findCandidates();
      const strong = rows.find((row) => row.candidate_id === ids.strong)!;

      expect(strong.shared_days).toEqual([0, 2]);
      expect(strong.overlap_minutes).toBe(480);
    });

    it('reports no overlap as zero rather than omitting the candidate', async () => {
      const rows = await findCandidates();
      const weak = rows.find((row) => row.candidate_id === ids.weak)!;

      // A classmate with no shared hours is still worth showing — the student
      // may change their availability.
      expect(weak.overlap_minutes).toBe(0);
      expect(weak.shared_days).toEqual([]);
    });

    it('never returns the caller', async () => {
      const rows = await findCandidates();

      expect(rows.map((row) => row.candidate_id)).not.toContain(ids.self);
    });
  });

  describe('visibility and tenancy', () => {
    it('excludes a classmate who is not discoverable', async () => {
      const rows = await findCandidates();

      expect(rows.map((row) => row.candidate_id)).not.toContain(ids.hidden);
    });

    it('returns nothing for a course the caller is not enrolled in', async () => {
      const rows = await findCandidates(otherOffering);

      expect(rows).toEqual([]);
    });

    it('never returns a student from another university', async () => {
      const rows = await findCandidates();

      expect(rows.map((row) => row.candidate_id)).not.toContain(ids.tau);
      expect(rows.every((row) => row.course_offering_id === sharedOffering)).toBe(true);
    });

    it('gives a student at another university no access to this one', async () => {
      const other = await signInAs(emails.tau);
      const { data } = await other.rpc('rpc_find_candidates', { p_limit: 50 });

      // Their own university has no other enrolled student, and ours must not
      // leak in — this is the check that the SECURITY DEFINER function does not
      // become a hole around RLS.
      expect((data ?? []).map((row) => row.candidate_id)).not.toContain(ids.strong);
      expect((data ?? []).map((row) => row.candidate_id)).not.toContain(ids.self);
    });

    it('excludes a candidate who blocked the caller, which RLS alone cannot see', async () => {
      // The reason the function needs definer rights: blocked_users is readable
      // in one direction only, so under invoker rights this block would be
      // invisible and the candidate would keep appearing.
      await admin
        .from('blocked_users')
        .insert({ blocker_id: ids.strong, blocked_id: ids.self });

      const rows = await findCandidates();
      expect(rows.map((row) => row.candidate_id)).not.toContain(ids.strong);

      await admin
        .from('blocked_users')
        .delete()
        .eq('blocker_id', ids.strong)
        .eq('blocked_id', ids.self);
    });

    it('excludes a candidate the caller blocked', async () => {
      await admin
        .from('blocked_users')
        .insert({ blocker_id: ids.self, blocked_id: ids.weak });

      const rows = await findCandidates();
      expect(rows.map((row) => row.candidate_id)).not.toContain(ids.weak);

      await admin
        .from('blocked_users')
        .delete()
        .eq('blocker_id', ids.self)
        .eq('blocked_id', ids.weak);
    });

    it('drops a candidate once a request is already live between them', async () => {
      const { error } = await admin.from('connection_requests').insert({
        requester_id: ids.self,
        addressee_id: ids.strong,
        course_offering_id: sharedOffering,
        university_id: RUNI_ID,
      });
      expect(error).toBeNull();

      const rows = await findCandidates();
      // Nothing left to suggest: the student has already asked.
      expect(rows.map((row) => row.candidate_id)).not.toContain(ids.strong);

      await admin
        .from('connection_requests')
        .delete()
        .eq('requester_id', ids.self)
        .eq('addressee_id', ids.strong);
    });
  });

});
