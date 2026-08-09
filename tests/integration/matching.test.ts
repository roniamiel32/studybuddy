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
      formats?: string[];
      city?: string;
      birthYear?: number;
      yearOfStudy?: number;
      degreeId?: string;
    },
  ) {
    const profile = await admin
      .from('profiles')
      .update({
        full_name: options.name,
        year_of_study: options.yearOfStudy ?? 2,
        city: options.city ?? null,
        degree_id: options.degreeId ?? null,
        is_discoverable: options.discoverable ?? true,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (profile.error) throw new Error(`${options.name} profile: ${profile.error.message}`);

    const prefs = await admin.from('learning_preferences').insert({
      profile_id: id,
      preferred_time_blocks: options.times as never,
      study_environments: options.envs as never,
      study_formats: (options.formats ?? ['in_person', 'remote']) as never,
      group_sizes: options.groups as never,
      studies_on_saturday: options.saturday,
      spoken_languages: options.languages,
    });
    if (prefs.error) throw new Error(`${options.name} prefs: ${prefs.error.message}`);

    if (options.birthYear) {
      const dob = await admin.from('profile_private').insert({
        profile_id: id,
        date_of_birth: `${options.birthYear}-06-15`,
      });
      if (dob.error) throw new Error(`${options.name} dob: ${dob.error.message}`);
    }

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


  describe('v2 rules', () => {
    const v2 = {
      viewer: `v2-viewer-${stamp}@post.runi.ac.il`,
      remoteOnly: `v2-remote-${stamp}@post.runi.ac.il`,
      hoursMatch: `v2-hours-${stamp}@post.runi.ac.il`,
      courseStacker: `v2-courses-${stamp}@post.runi.ac.il`,
      neighbour: `v2-neighbour-${stamp}@post.runi.ac.il`,
    };
    const v2Ids: Record<string, string> = {};
    let viewer: SupabaseClient<Database>;

    beforeAll(async () => {
      const secondOffering = await offeringIdByCode(admin, 'CS-2010', RUNI_CURRENT_TERM_ID);
      const thirdOffering = await offeringIdByCode(admin, 'CS-2020', RUNI_CURRENT_TERM_ID);
      const CS_DEGREE = 'de600001-0000-4000-8000-000000000001';

      for (const [key, email] of Object.entries(v2)) {
        v2Ids[key] = await createStudent(admin, email);
      }

      /* In-person only, morning, quiet, Tel Aviv, born 2003, year 2. */
      await completeProfile(v2Ids.viewer, {
        name: 'V2 Viewer',
        times: ['morning'],
        envs: ['quiet'],
        groups: ['small'],
        saturday: false,
        languages: ['he'],
        formats: ['in_person'],
        city: 'Tel Aviv',
        birthYear: 2003,
        yearOfStudy: 2,
        degreeId: CS_DEGREE,
        universityId: RUNI_ID,
        slots: [[0, '10:00', '12:00']],
        offerings: [sharedOffering, secondOffering, thirdOffering],
      });

      /* Identical in every way EXCEPT format: remote only. Must be filtered. */
      await completeProfile(v2Ids.remoteOnly, {
        name: 'V2 Remote Only',
        times: ['morning'],
        envs: ['quiet'],
        groups: ['small'],
        saturday: false,
        languages: ['he'],
        formats: ['remote'],
        universityId: RUNI_ID,
        slots: [[0, '10:00', '12:00']],
        offerings: [sharedOffering],
      });

      /* Exact hours and environment, ONE shared course, nothing else. */
      await completeProfile(v2Ids.hoursMatch, {
        name: 'V2 Hours Match',
        times: ['morning'],
        envs: ['quiet'],
        groups: ['large'],
        saturday: true,
        languages: ['fr'],
        formats: ['in_person'],
        universityId: RUNI_ID,
        slots: [],
        offerings: [sharedOffering],
      });

      /* THREE shared courses, but opposite hours. Must still lose. */
      await completeProfile(v2Ids.courseStacker, {
        name: 'V2 Course Stacker',
        times: ['evening'],
        envs: ['quiet'],
        groups: ['small'],
        saturday: false,
        languages: ['he'],
        formats: ['in_person'],
        universityId: RUNI_ID,
        slots: [],
        offerings: [sharedOffering, secondOffering, thirdOffering],
      });

      /* Same city, same cohort, three-year age gap: every bonus fires. */
      await completeProfile(v2Ids.neighbour, {
        name: 'V2 Neighbour',
        times: ['morning'],
        envs: ['quiet'],
        groups: ['small'],
        saturday: false,
        languages: ['he'],
        formats: ['in_person'],
        city: 'tel aviv  ',
        birthYear: 2000,
        yearOfStudy: 2,
        degreeId: CS_DEGREE,
        universityId: RUNI_ID,
        slots: [[0, '10:00', '12:00']],
        offerings: [sharedOffering],
      });

      viewer = await signInAs(v2.viewer);
    }, 90_000);

    /**
     * Rows for the v2 viewer, folded to one per candidate.
     *
     * @returns The best row per candidate id.
     */
    async function rowsByName() {
      const { data, error } = await viewer.rpc('rpc_find_candidates', { p_limit: 100 });
      expect(error).toBeNull();

      type Row = NonNullable<typeof data>[number];
      const best = new Map<string, Row>();
      for (const row of data ?? []) {
        if (!best.has(row.full_name ?? '')) {
          best.set(row.full_name ?? '', row);
        }
      }
      return best;
    }

    it('excludes a remote-only student from an in-person-only viewer', async () => {
      const rows = await rowsByName();

      // Identical on every scored term; excluded purely on format. This is the
      // strict filter, not a low score.
      expect(rows.has('V2 Remote Only')).toBe(false);
    });

    it('ranks exact hours and environment above stacked shared courses', async () => {
      const rows = await rowsByName();
      const hoursMatch = rows.get('V2 Hours Match')!;
      const stacker = rows.get('V2 Course Stacker')!;

      expect(hoursMatch).toBeDefined();
      expect(stacker).toBeDefined();

      // The rule this version exists to enforce: one shared course with matching
      // hours beats three shared courses with opposite hours.
      expect(Number(hoursMatch.rule_score)).toBeGreaterThan(Number(stacker.rule_score));
      expect(hoursMatch.hours_exact).toBe(true);
      expect(hoursMatch.shared_course_count).toBe(1);
      expect(stacker.shared_course_count).toBe(3);
    });

    it('awards every bonus when city, age and cohort all align', async () => {
      const rows = await rowsByName();
      const neighbour = rows.get('V2 Neighbour')!;

      expect(neighbour.same_city).toBe(true);
      expect(neighbour.close_in_age).toBe(true);
      expect(neighbour.same_cohort).toBe(true);
      expect(Number(neighbour.bonus_points)).toBe(15);
    });

    it('matches cities case- and whitespace-insensitively', async () => {
      // The neighbour's city is stored as "tel aviv  " against the viewer's
      // "Tel Aviv". A student typing their own city should not lose the bonus to
      // a stray capital.
      const rows = await rowsByName();

      expect(rows.get('V2 Neighbour')!.same_city).toBe(true);
    });

    it('awards no bonuses to a candidate who shares none of them', async () => {
      const rows = await rowsByName();
      const hoursMatch = rows.get('V2 Hours Match')!;

      expect(hoursMatch.same_city).toBe(false);
      expect(hoursMatch.close_in_age).toBe(false);
      expect(Number(hoursMatch.bonus_points)).toBe(0);
    });

    afterAll(async () => {
      await deleteStudents(admin, Object.values(v2Ids));
    });

    it('never exceeds 100 even with every bonus', async () => {
      const rows = await rowsByName();

      for (const row of rows.values()) {
        expect(Number(row.rule_score)).toBeLessThanOrEqual(100);
      }
    });
  });
});
