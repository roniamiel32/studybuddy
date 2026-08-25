/**
 * File:        tests/integration/course-overrides.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Tests for per-course preference overrides.
 *
 *              THE CLAIM BEING TESTED is the one that makes the feature real
 *              rather than decorative: an override has to change WHO IS MATCHED,
 *              for that course only, while every other course keeps using the
 *              global answer. A settings screen that stores a value nobody reads
 *              would pass a UI test and fail the student.
 *
 *              The sharp case is the user's own example: remote globally,
 *              in-person for one class. Study format is a strict filter, so that
 *              override must remove a remote-only classmate from that one course
 *              and leave them visible everywhere else.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - Initial tests (Phase 4)
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
  console.warn('Skipping override tests: run `npm run db:start` and populate .env.local.');
}

describeDb('per-course preference overrides', () => {
  const admin = hasLocalDb() ? adminDb() : null!;
  const stamp = Math.random().toString(36).slice(2, 8);

  const emails = {
    /* The viewer: remote-only globally. */
    self: `ovr-self-${stamp}@post.runi.ac.il`,
    /* Remote-only, shares both courses. Should vanish from the overridden one. */
    remote: `ovr-remote-${stamp}@post.runi.ac.il`,
    /* In-person only, shares both courses. Should appear ONLY on the overridden one. */
    inPerson: `ovr-inperson-${stamp}@post.runi.ac.il`,
    /* An outsider, for the privacy check. */
    nosy: `ovr-nosy-${stamp}@post.runi.ac.il`,
  };

  const ids: Record<keyof typeof emails, string> = {
    self: '',
    remote: '',
    inPerson: '',
    nosy: '',
  };

  let self: SupabaseClient<Database>;
  let nosy: SupabaseClient<Database>;
  let overriddenOffering = '';
  let normalOffering = '';

  /**
   * Makes a student matchable with the given formats and times.
   *
   * @param id      - Their profile id.
   * @param options - Name, formats, times and the courses to enroll in.
   * @returns Nothing.
   */
  async function completeProfile(
    id: string,
    options: { name: string; formats: string[]; times: string[]; offerings: string[] },
  ) {
    const profile = await admin
      .from('profiles')
      .update({
        full_name: options.name,
        year_of_study: 2,
        is_discoverable: true,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (profile.error) throw new Error(`${options.name} profile: ${profile.error.message}`);

    const prefs = await admin.from('learning_preferences').insert({
      profile_id: id,
      preferred_time_blocks: options.times as never,
      study_environments: ['quiet'] as never,
      study_formats: options.formats as never,
      group_sizes: ['small'] as never,
      studies_on_saturday: false,
      spoken_languages: ['he', 'en'],
    });
    if (prefs.error) throw new Error(`${options.name} prefs: ${prefs.error.message}`);

    for (const offering of options.offerings) {
      const enrolled = await admin.from('enrollments').insert({
        profile_id: id,
        course_offering_id: offering,
        university_id: RUNI_ID,
      });
      if (enrolled.error) throw new Error(`${options.name} enroll: ${enrolled.error.message}`);
    }

    /* Shared free time, so overlap is never the reason someone is missing. */
    const slots = await admin.from('availability_slots').insert({
      profile_id: id,
      day_of_week: 0,
      starts_at: '10:00',
      ends_at: '14:00',
    });
    if (slots.error) throw new Error(`${options.name} slots: ${slots.error.message}`);
  }

  beforeAll(async () => {
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      ids[key] = await createStudent(admin, emails[key]);
    }

    overriddenOffering = await offeringIdByCode(admin, 'CS-3040', RUNI_CURRENT_TERM_ID);
    normalOffering = await offeringIdByCode(admin, 'CS-2010', RUNI_CURRENT_TERM_ID);

    const both = [overriddenOffering, normalOffering];

    await completeProfile(ids.self, {
      name: 'Override Self',
      formats: ['remote'],
      times: ['morning'],
      offerings: both,
    });
    await completeProfile(ids.remote, {
      name: 'Remote Only',
      formats: ['remote'],
      times: ['morning'],
      offerings: both,
    });
    await completeProfile(ids.inPerson, {
      name: 'In Person Only',
      formats: ['in_person'],
      times: ['morning'],
      offerings: both,
    });
    await completeProfile(ids.nosy, {
      name: 'Nosy Classmate',
      formats: ['remote'],
      times: ['morning'],
      offerings: both,
    });

    self = await signInAs(emails.self);
    nosy = await signInAs(emails.nosy);
  }, 90_000);

  afterAll(async () => {
    await deleteStudents(admin, Object.values(ids));
  });

  /**
   * Candidate names the viewer sees for one course.
   *
   * @param client     - The signed-in student to ask as.
   * @param offeringId - The course to scope to.
   * @returns Their names.
   */
  async function namesFor(client: SupabaseClient<Database>, offeringId: string) {
    const { data, error } = await client.rpc('rpc_find_candidates', {
      p_course_offering_id: offeringId,
      p_limit: 50,
    });

    expect(error).toBeNull();

    return (data ?? []).map((row) => row.full_name);
  }

  describe('with no override set', () => {
    it('matches on the global answer, on every course', async () => {
      /* Baseline. The viewer is remote-only globally, so the in-person-only
         student is excluded by the strict format filter everywhere. */
      const overridden = await namesFor(self, overriddenOffering);
      const normal = await namesFor(self, normalOffering);

      expect(overridden).toContain('Remote Only');
      expect(overridden).not.toContain('In Person Only');
      expect(normal).toContain('Remote Only');
      expect(normal).not.toContain('In Person Only');
    });
  });

  describe('with an in-person override on one course', () => {
    beforeAll(async () => {
      /* The user's own example: remote generally, in person for this one class.
         Written as the student, so the enrollment UPDATE policy is exercised. */
      const { error } = await self
        .from('enrollments')
        .update({ study_formats: ['in_person'] as never })
        .eq('profile_id', ids.self)
        .eq('course_offering_id', overriddenOffering);

      expect(error).toBeNull();
    });

    it('changes who is matched FOR THAT COURSE', async () => {
      const names = await namesFor(self, overriddenOffering);

      /* The whole point: the override flips the strict filter for this course. */
      expect(names).toContain('In Person Only');
      expect(names).not.toContain('Remote Only');
    });

    it('leaves every other course on the global answer', async () => {
      const names = await namesFor(self, normalOffering);

      /* Untouched. An override that leaked across courses would be worse than
         no override at all — the student would lose matches they never changed. */
      expect(names).toContain('Remote Only');
      expect(names).not.toContain('In Person Only');
    });

    it('applies to the cross-course view without erasing anyone', async () => {
      /* The dashboard asks for every course at once. Each row is scored under the
         rules of its own course, so both classmates appear — from different
         courses. */
      const { data } = await self.rpc('rpc_find_candidates', { p_limit: 100 });
      const names = (data ?? []).map((row) => row.full_name);

      expect(names).toContain('In Person Only');
      expect(names).toContain('Remote Only');
    });
  });

  describe('with a time-of-day override', () => {
    beforeAll(async () => {
      /* Evening for the overridden course; the classmates all prefer mornings. */
      const { error } = await self
        .from('enrollments')
        .update({
          study_formats: null,
          preferred_time_blocks: ['evening'] as never,
        })
        .eq('profile_id', ids.self)
        .eq('course_offering_id', overriddenOffering);

      expect(error).toBeNull();
    });

    it('scores that course lower than the untouched one', async () => {
      const overridden = await self.rpc('rpc_find_candidates', {
        p_course_offering_id: overriddenOffering,
        p_limit: 50,
      });
      const normal = await self.rpc('rpc_find_candidates', {
        p_course_offering_id: normalOffering,
        p_limit: 50,
      });

      const scoreOf = (rows: typeof overridden.data, name: string) =>
        Number(rows?.find((row) => row.full_name === name)?.rule_score ?? 0);

      /*
       * Same two people, same everything else — only the resolved time-of-day
       * differs. Disjoint hours halve the core score, so the overridden course
       * must rank the same classmate materially lower.
       */
      expect(scoreOf(normal.data, 'Remote Only')).toBeGreaterThan(
        scoreOf(overridden.data, 'Remote Only'),
      );
    });

    it('reports the hours as not exact for the overridden course', async () => {
      const { data } = await self.rpc('rpc_find_candidates', {
        p_course_offering_id: overriddenOffering,
        p_limit: 50,
      });

      const row = data?.find((candidate) => candidate.full_name === 'Remote Only');

      expect(row?.hours_exact).toBe(false);
    });
  });

  describe('privacy and integrity', () => {
    it('is readable by a visible classmate, by the same rule as global preferences', async () => {
      /*
       * Stated rather than assumed, because putting the overrides on `enrollments`
       * decided their visibility.
       *
       * `enrollments` is readable by you and by visible classmates — that is how
       * shared courses are computed — so the override columns are readable too.
       * That is not a new disclosure: `learning_preferences` carries the IDENTICAL
       * policy, and a candidate's preferences are already shown on their match
       * card as trait chips. A student's study style is not a secret in this
       * product; their phone number and date of birth are, and both live in
       * separate tables for exactly that reason.
       *
       * If preferences ever do become private, this is the test that will fail and
       * point at the two policies that have to change together.
       */
      const overrides = await nosy
        .from('enrollments')
        .select('profile_id, preferred_time_blocks')
        .eq('profile_id', ids.self)
        .eq('course_offering_id', overriddenOffering)
        .maybeSingle();

      const globals = await nosy
        .from('learning_preferences')
        .select('profile_id, preferred_time_blocks')
        .eq('profile_id', ids.self)
        .maybeSingle();

      /* Both visible, or neither. The point is that they agree. */
      expect(overrides.data === null).toBe(globals.data === null);
      expect(overrides.data?.preferred_time_blocks).toEqual(['evening']);
    });

    it('refuses to write an override on someone else’s enrollment', async () => {
      const { data, error } = await nosy
        .from('enrollments')
        .update({ preferred_time_blocks: ['noon'] as never })
        .eq('profile_id', ids.self)
        .eq('course_offering_id', overriddenOffering)
        .select('profile_id');

      /* Zero rows: the update policy is scoped to your own enrollments, so the
         row is not updatable and Postgres reports success on nothing. */
      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);

      /* And it really did not change. */
      const { data: after } = await self
        .from('enrollments')
        .select('preferred_time_blocks')
        .eq('profile_id', ids.self)
        .eq('course_offering_id', overriddenOffering)
        .single();

      expect(after?.preferred_time_blocks).toEqual(['evening']);
    });

    it('refuses an empty override, which would mean "answered nothing"', async () => {
      /* Null means inherit. An empty array would be a third state with no
         meaning, so the CHECK constraint forbids it. */
      const { error } = await self
        .from('enrollments')
        .update({ preferred_time_blocks: [] as never })
        .eq('profile_id', ids.self)
        .eq('course_offering_id', overriddenOffering);

      expect(error).not.toBeNull();
    });

    it('clears back to the global answer when set to null', async () => {
      const { error } = await self
        .from('enrollments')
        .update({ preferred_time_blocks: null, study_formats: null })
        .eq('profile_id', ids.self)
        .eq('course_offering_id', overriddenOffering);

      expect(error).toBeNull();

      const names = await namesFor(self, overriddenOffering);

      /* Back to the baseline from the first test. */
      expect(names).toContain('Remote Only');
      expect(names).not.toContain('In Person Only');
    });
  });
});
