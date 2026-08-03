/**
 * File:        tests/integration/schema.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Integration tests for the Phase 1a schema, run against the
 *              local Supabase stack. These cover the invariants that live in
 *              the database rather than in application code: tenant resolution
 *              at signup, the denormalised university_id triggers, the
 *              unordered-pair request constraint, and the availability overlap
 *              function. Each is something the application could get wrong and
 *              the database must refuse anyway.
 * Version:     0.3.0
 *
 * Modifications:
 *     0.3.0 - 2026-08-03 - Initial tests (Phase 1a)
 */

import { afterAll, describe, expect, it } from 'vitest';

import {
  RUNI_CURRENT_TERM_ID,
  RUNI_ID,
  RUNI_PAST_TERM_ID,
  TAU_ID,
  adminDb,
  createStudent,
  deleteStudents,
  hasLocalDb,
  offeringIdByCode,
} from './helpers/db';

const describeDb = hasLocalDb() ? describe : describe.skip;

if (!hasLocalDb()) {
  console.warn(
    'Skipping schema integration tests: run `npm run db:start` and populate .env.local.',
  );
}

describeDb('Phase 1a schema', () => {
  const db = hasLocalDb() ? adminDb() : null!;
  const createdUsers: string[] = [];
  const unique = () => Math.random().toString(36).slice(2, 10);

  afterAll(async () => {
    await deleteStudents(db, createdUsers);
  });

  describe('seed integrity', () => {
    it('seeds exactly one current term per university', async () => {
      const { data, error } = await db
        .from('terms')
        .select('university_id, name')
        .eq('is_current', true);

      expect(error).toBeNull();
      const byUniversity = new Set(data?.map((t) => t.university_id));
      expect(byUniversity.size).toBe(data?.length);
      expect(byUniversity.has(RUNI_ID)).toBe(true);
      expect(byUniversity.has(TAU_ID)).toBe(true);
    });

    it('seeds a second tenant, without which multi-tenancy is untested', async () => {
      const { count } = await db
        .from('courses')
        .select('*', { count: 'exact', head: true })
        .eq('university_id', TAU_ID);

      expect(count).toBeGreaterThan(0);
    });

    it('offers the same course name in both tenants, as a leakage tripwire', async () => {
      const { data } = await db
        .from('courses')
        .select('university_id, name')
        .eq('name', 'Full-Stack Web Development');

      expect(new Set(data?.map((c) => c.university_id)).size).toBe(2);
    });
  });

  describe('handle_new_user: tenant resolution at signup', () => {
    it('creates a profile in the university that owns the email domain', async () => {
      const id = await createStudent(db, `roni-${unique()}@post.runi.ac.il`);
      createdUsers.push(id);

      const { data } = await db
        .from('profiles')
        .select('university_id, full_name, availability_mode, onboarding_completed_at')
        .eq('id', id)
        .single();

      expect(data?.university_id).toBe(RUNI_ID);
      // Never invented from the email address — onboarding collects it.
      expect(data?.full_name).toBeNull();
      expect(data?.availability_mode).toBe('manual');
      expect(data?.onboarding_completed_at).toBeNull();
    });

    it('routes a different domain to a different tenant', async () => {
      const id = await createStudent(db, `eden-${unique()}@mail.tau.ac.il`);
      createdUsers.push(id);

      const { data } = await db
        .from('profiles')
        .select('university_id')
        .eq('id', id)
        .single();

      expect(data?.university_id).toBe(TAU_ID);
    });

    it('refuses an unrecognised email domain', async () => {
      await expect(createStudent(db, `outsider-${unique()}@gmail.com`)).rejects.toThrow();
    });

    it('refuses a staff domain, which is not a student domain', async () => {
      // runi.ac.il is seeded with is_student_domain = false.
      await expect(createStudent(db, `staff-${unique()}@runi.ac.il`)).rejects.toThrow();
    });
  });

  describe('denormalised university_id triggers', () => {
    it('overwrites a forged university_id on enrollment', async () => {
      const id = await createStudent(db, `enroll-${unique()}@post.runi.ac.il`);
      createdUsers.push(id);

      const offeringId = await offeringIdByCode(db, 'CS-3040', RUNI_CURRENT_TERM_ID);

      // A malicious client claims to belong to the other tenant.
      const { data, error } = await db
        .from('enrollments')
        .insert({
          profile_id: id,
          course_offering_id: offeringId,
          university_id: TAU_ID,
          intent: 'want_partner',
        })
        .select('university_id')
        .single();

      expect(error).toBeNull();
      // The trigger derives it from the offering and ignores what was sent.
      expect(data?.university_id).toBe(RUNI_ID);
    });

    it('rejects a study request that would cross institutions', async () => {
      const runiStudent = await createStudent(db, `a-${unique()}@post.runi.ac.il`);
      const tauStudent = await createStudent(db, `b-${unique()}@mail.tau.ac.il`);
      createdUsers.push(runiStudent, tauStudent);

      const offeringId = await offeringIdByCode(db, 'CS-2010', RUNI_CURRENT_TERM_ID);

      const { error } = await db.from('connection_requests').insert({
        requester_id: runiStudent,
        addressee_id: tauStudent,
        course_offering_id: offeringId,
        university_id: RUNI_ID,
      });

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/cannot cross institutions/i);
    });
  });

  describe('connection request constraints', () => {
    it('rejects a mirrored request, so two students cannot deadlock', async () => {
      const first = await createStudent(db, `p1-${unique()}@post.runi.ac.il`);
      const second = await createStudent(db, `p2-${unique()}@post.runi.ac.il`);
      createdUsers.push(first, second);

      const offeringId = await offeringIdByCode(db, 'CS-3010', RUNI_CURRENT_TERM_ID);

      const forward = await db.from('connection_requests').insert({
        requester_id: first,
        addressee_id: second,
        course_offering_id: offeringId,
        university_id: RUNI_ID,
      });
      expect(forward.error).toBeNull();

      // Same pair, same course, opposite direction: must collide.
      const reverse = await db.from('connection_requests').insert({
        requester_id: second,
        addressee_id: first,
        course_offering_id: offeringId,
        university_id: RUNI_ID,
      });

      expect(reverse.error).not.toBeNull();
      expect(reverse.error?.code).toBe('23505');
    });

    it('allows the same pair to pair up again in a different course', async () => {
      const first = await createStudent(db, `p3-${unique()}@post.runi.ac.il`);
      const second = await createStudent(db, `p4-${unique()}@post.runi.ac.il`);
      createdUsers.push(first, second);

      const courseA = await offeringIdByCode(db, 'CS-2020', RUNI_CURRENT_TERM_ID);
      const courseB = await offeringIdByCode(db, 'CS-3030', RUNI_CURRENT_TERM_ID);

      const one = await db.from('connection_requests').insert({
        requester_id: first,
        addressee_id: second,
        course_offering_id: courseA,
        university_id: RUNI_ID,
      });
      const two = await db.from('connection_requests').insert({
        requester_id: first,
        addressee_id: second,
        course_offering_id: courseB,
        university_id: RUNI_ID,
      });

      expect(one.error).toBeNull();
      expect(two.error).toBeNull();
    });

    it('rejects a request to yourself', async () => {
      const solo = await createStudent(db, `solo-${unique()}@post.runi.ac.il`);
      createdUsers.push(solo);

      const offeringId = await offeringIdByCode(db, 'CS-1001', RUNI_CURRENT_TERM_ID);

      const { error } = await db.from('connection_requests').insert({
        requester_id: solo,
        addressee_id: solo,
        course_offering_id: offeringId,
        university_id: RUNI_ID,
      });

      expect(error).not.toBeNull();
    });
  });

  describe('availability slots and overlap', () => {
    it('computes overlapping free minutes across the week', async () => {
      const first = await createStudent(db, `av1-${unique()}@post.runi.ac.il`);
      const second = await createStudent(db, `av2-${unique()}@post.runi.ac.il`);
      createdUsers.push(first, second);

      // Sunday 10:00-14:00 and Tuesday 18:00-20:00.
      await db.from('availability_slots').insert([
        { profile_id: first, day_of_week: 0, starts_at: '10:00', ends_at: '14:00' },
        { profile_id: first, day_of_week: 2, starts_at: '18:00', ends_at: '20:00' },
      ]);

      // Sunday 12:00-16:00 (2h overlap), Tuesday 19:00-19:30 (30m overlap),
      // Thursday 09:00-11:00 (no counterpart).
      await db.from('availability_slots').insert([
        { profile_id: second, day_of_week: 0, starts_at: '12:00', ends_at: '16:00' },
        { profile_id: second, day_of_week: 2, starts_at: '19:00', ends_at: '19:30' },
        { profile_id: second, day_of_week: 4, starts_at: '09:00', ends_at: '11:00' },
      ]);

      const { data, error } = await db.rpc('app_overlap_minutes', {
        profile_a: first,
        profile_b: second,
      });

      expect(error).toBeNull();
      expect(data).toBe(150);
    });

    it('is symmetric', async () => {
      const first = await createStudent(db, `av3-${unique()}@post.runi.ac.il`);
      const second = await createStudent(db, `av4-${unique()}@post.runi.ac.il`);
      createdUsers.push(first, second);

      await db.from('availability_slots').insert([
        { profile_id: first, day_of_week: 1, starts_at: '08:00', ends_at: '12:00' },
        { profile_id: second, day_of_week: 1, starts_at: '11:00', ends_at: '13:00' },
      ]);

      const forward = await db.rpc('app_overlap_minutes', {
        profile_a: first,
        profile_b: second,
      });
      const backward = await db.rpc('app_overlap_minutes', {
        profile_a: second,
        profile_b: first,
      });

      expect(forward.data).toBe(60);
      expect(backward.data).toBe(60);
    });

    it('returns zero rather than null when there is no overlap at all', async () => {
      const first = await createStudent(db, `av5-${unique()}@post.runi.ac.il`);
      const second = await createStudent(db, `av6-${unique()}@post.runi.ac.il`);
      createdUsers.push(first, second);

      await db.from('availability_slots').insert([
        { profile_id: first, day_of_week: 0, starts_at: '08:00', ends_at: '10:00' },
        { profile_id: second, day_of_week: 3, starts_at: '08:00', ends_at: '10:00' },
      ]);

      const { data } = await db.rpc('app_overlap_minutes', {
        profile_a: first,
        profile_b: second,
      });

      expect(data).toBe(0);
    });

    it('lets a manual slot and a synced slot share a start time (D7)', async () => {
      const student = await createStudent(db, `av7-${unique()}@post.runi.ac.il`);
      createdUsers.push(student);

      const manual = await db.from('availability_slots').insert({
        profile_id: student,
        day_of_week: 0,
        starts_at: '09:00',
        ends_at: '11:00',
        source: 'manual',
      });

      // Same profile, day and start time, different source: permitted, because
      // a resync must be able to write its own rows without colliding with
      // hand-added ones.
      const synced = await db.from('availability_slots').insert({
        profile_id: student,
        day_of_week: 0,
        starts_at: '09:00',
        ends_at: '10:00',
        source: 'google_calendar',
      });

      expect(manual.error).toBeNull();
      expect(synced.error).toBeNull();

      // A second manual row at the same start time is still a duplicate.
      const duplicate = await db.from('availability_slots').insert({
        profile_id: student,
        day_of_week: 0,
        starts_at: '09:00',
        ends_at: '12:00',
        source: 'manual',
      });

      expect(duplicate.error?.code).toBe('23505');
    });

    it('rejects a slot that ends before it starts', async () => {
      const student = await createStudent(db, `av8-${unique()}@post.runi.ac.il`);
      createdUsers.push(student);

      const { error } = await db.from('availability_slots').insert({
        profile_id: student,
        day_of_week: 0,
        starts_at: '14:00',
        ends_at: '10:00',
      });

      expect(error).not.toBeNull();
    });
  });

  describe('profile_contacts', () => {
    it('rejects a phone number that is not E.164', async () => {
      const student = await createStudent(db, `ph1-${unique()}@post.runi.ac.il`);
      createdUsers.push(student);

      const { error } = await db.from('profile_contacts').insert({
        profile_id: student,
        phone_e164: '050-123-4567',
      });

      expect(error).not.toBeNull();
    });

    it('accepts a normalised Israeli number', async () => {
      const student = await createStudent(db, `ph2-${unique()}@post.runi.ac.il`);
      createdUsers.push(student);

      const { error } = await db.from('profile_contacts').insert({
        profile_id: student,
        phone_e164: '+972501234567',
      });

      expect(error).toBeNull();
    });
  });

  describe('course offerings', () => {
    it('keeps a past-term offering distinct from the current one', async () => {
      const current = await offeringIdByCode(db, 'CS-2010', RUNI_CURRENT_TERM_ID);
      const past = await offeringIdByCode(db, 'CS-2010', RUNI_PAST_TERM_ID);

      // The same course in two terms is two different dashboards. This is the
      // whole reason course_offerings exists.
      expect(current).not.toBe(past);
    });
  });
});
