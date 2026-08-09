/**
 * File:        scripts/seed-students.mjs
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Creates demo students so the matching screens have real people
 *              to rank.
 *
 *              This is the mitigation for the cold-start risk in design section
 *              6.1: a matching engine with one user in the database looks broken
 *              and cannot be demonstrated or tested. The students here vary
 *              deliberately across every scoring term, so the ranking has
 *              something to distinguish.
 *
 *              Run with `npm run seed:students`. Idempotent — existing demo
 *              accounts are left alone.
 * Version:     0.8.0
 *
 * Modifications:
 *     0.8.0 - 2026-08-05 - Initial implementation (Phase 2)
 */

import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* Fall through to whatever is already in the environment. */
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = 'demo-student-1234';

const RUNI = '11111111-1111-4111-8111-111111111111';
const TAU = '22222222-2222-4222-8222-222222222222';
const RUNI_CS_TRACK = '7ac00001-0000-4000-8000-000000000001';

if (!URL || !SERVICE_KEY) {
  console.error('Missing Supabase config. Run `npm run db:start` and fill .env.local.');
  process.exit(1);
}

const db = createClient(URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * The demo cohort.
 *
 * Spread across every scoring term on purpose: a set that all answered
 * identically would rank identically and prove nothing. `courses` lists course
 * codes, so overlapping and non-overlapping enrolments are both represented.
 */
const STUDENTS = [
  {
    name: 'Maya Shalev',
    year: 2,
    times: ['morning'],
    envs: ['quiet'],
    groups: ['small'],
    saturday: false,
    languages: ['he', 'en'],
    intent: 'want_partner',
    courses: ['CS-2010', 'CS-3040', 'CS-2020'],
    slots: [
      [0, '10:00', '12:00'],
      [2, '10:00', '12:00'],
      [4, '08:00', '12:00'],
    ],
  },
  {
    name: 'Leo Tavor',
    year: 3,
    times: ['morning', 'noon'],
    envs: ['quiet', 'discussion'],
    groups: ['small', 'large'],
    saturday: false,
    languages: ['he'],
    intent: 'can_tutor',
    courses: ['CS-2010', 'CS-3040'],
    slots: [
      [0, '10:00', '14:00'],
      [1, '12:00', '16:00'],
      [3, '10:00', '12:00'],
    ],
  },
  {
    name: 'Alex Kaplan',
    year: 2,
    times: ['evening'],
    envs: ['discussion'],
    groups: ['large'],
    saturday: true,
    languages: ['en'],
    intent: 'need_help',
    courses: ['CS-2010', 'CS-2020'],
    slots: [
      [1, '18:00', '22:00'],
      [3, '18:00', '22:00'],
      [6, '10:00', '14:00'],
    ],
  },
  {
    name: 'Sarah Mizrahi',
    year: 1,
    times: ['morning', 'evening'],
    envs: ['quiet'],
    groups: ['small'],
    saturday: false,
    languages: ['he', 'en', 'fr'],
    intent: 'want_partner',
    courses: ['CS-2010', 'CS-1001'],
    slots: [
      [0, '08:00', '12:00'],
      [2, '18:00', '20:00'],
      [4, '10:00', '12:00'],
    ],
  },
  {
    name: 'Noam Berger',
    year: 4,
    times: ['noon'],
    envs: ['discussion'],
    groups: ['small'],
    saturday: false,
    languages: ['he'],
    intent: 'can_tutor',
    courses: ['CS-3040', 'CS-3030'],
    slots: [
      [1, '12:00', '16:00'],
      [3, '12:00', '16:00'],
    ],
  },
  {
    name: 'Tamar Adler',
    year: 2,
    times: ['morning', 'noon', 'evening'],
    envs: ['quiet', 'discussion'],
    groups: ['small', 'large'],
    saturday: true,
    languages: ['he', 'en'],
    intent: 'want_partner',
    courses: ['CS-2010', 'CS-2020', 'CS-3040', 'CS-3030'],
    slots: [
      [0, '10:00', '16:00'],
      [1, '10:00', '16:00'],
      [2, '10:00', '16:00'],
      [4, '10:00', '14:00'],
    ],
  },
  {
    name: 'Yonatan Peled',
    year: 3,
    times: ['evening'],
    envs: ['quiet'],
    groups: ['small'],
    saturday: false,
    languages: ['ru', 'he'],
    intent: 'need_help',
    courses: ['CS-2020'],
    slots: [
      [2, '20:00', '22:00'],
      [4, '20:00', '22:00'],
    ],
  },
  {
    /* No overlapping availability with the morning cohort at all, so the
       schedule term has a genuine zero to produce. */
    name: 'Dana Rosen',
    year: 1,
    times: ['evening'],
    envs: ['discussion'],
    groups: ['large'],
    saturday: true,
    languages: ['en'],
    intent: 'want_partner',
    courses: ['CS-1001'],
    slots: [[5, '18:00', '22:00']],
  },
];

/** One Tel Aviv student, purely as a cross-tenant control for the tests. */
const TAU_STUDENT = {
  name: 'Omer Katz',
  year: 2,
  times: ['morning'],
  envs: ['quiet'],
  groups: ['small'],
  saturday: false,
  languages: ['he'],
  intent: 'want_partner',
  courses: ['TAU-2010'],
  slots: [[0, '10:00', '12:00']],
};

/**
 * Maps course codes to the current term's offering ids for one university.
 *
 * @param universityId - The tenant to look up.
 * @returns A map of course code to offering id.
 */
async function currentOfferingsByCode(universityId) {
  const { data, error } = await db
    .from('course_offerings')
    .select('id, courses!inner(code, university_id), terms!inner(is_current)')
    .eq('courses.university_id', universityId)
    .eq('terms.is_current', true);

  if (error) {
    throw new Error(`Could not read offerings: ${error.message}`);
  }

  return new Map(data.map((row) => [row.courses.code, row.id]));
}

/**
 * Creates one student, complete enough to be matchable.
 *
 * @param spec         - The student definition.
 * @param email        - Their address; the domain decides the tenant.
 * @param trackId      - Study track, or null.
 * @param offerings    - Course code to offering id map.
 * @param existing     - Emails already present, to stay idempotent.
 * @returns 'created' or 'skipped'.
 */
async function seedStudent(spec, email, trackId, offerings, existing) {
  if (existing.has(email)) {
    return 'skipped';
  }

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (createError || !created.user) {
    throw new Error(`${email}: ${createError?.message ?? 'no user returned'}`);
  }

  const id = created.user.id;

  /* onboarding_completed_at is what makes them visible to matching at all. */
  const { error: profileError } = await db
    .from('profiles')
    .update({
      full_name: spec.name,
      study_track_id: trackId,
      year_of_study: spec.year,
      is_discoverable: true,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (profileError) {
    throw new Error(`${email} profile: ${profileError.message}`);
  }

  const { error: prefError } = await db.from('learning_preferences').insert({
    profile_id: id,
    preferred_time_blocks: spec.times,
    study_environments: spec.envs,
    group_sizes: spec.groups,
    studies_on_saturday: spec.saturday,
    spoken_languages: spec.languages,
  });

  if (prefError) {
    throw new Error(`${email} preferences: ${prefError.message}`);
  }

  const { error: slotError } = await db.from('availability_slots').insert(
    spec.slots.map(([day, start, end]) => ({
      profile_id: id,
      day_of_week: day,
      starts_at: start,
      ends_at: end,
      source: 'manual',
    })),
  );

  if (slotError) {
    throw new Error(`${email} availability: ${slotError.message}`);
  }

  const enrolments = spec.courses
    .map((code) => offerings.get(code))
    .filter(Boolean)
    .map((offeringId) => ({
      profile_id: id,
      course_offering_id: offeringId,
      /* Overwritten by the set_enrollment_university trigger. */
      university_id: '00000000-0000-0000-0000-000000000000',
      intent: spec.intent,
    }));

  if (enrolments.length > 0) {
    const { error: enrolError } = await db.from('enrollments').insert(enrolments);
    if (enrolError) {
      throw new Error(`${email} enrollments: ${enrolError.message}`);
    }
  }

  return 'created';
}

/**
 * Seeds the whole cohort.
 *
 * @returns Nothing.
 */
async function main() {
  const { data: users } = await db.auth.admin.listUsers({ perPage: 500 });
  const existing = new Set((users?.users ?? []).map((user) => user.email));

  const runiOfferings = await currentOfferingsByCode(RUNI);
  const tauOfferings = await currentOfferingsByCode(TAU);

  let created = 0;
  let skipped = 0;

  for (const [index, spec] of STUDENTS.entries()) {
    const email = `demo${index + 1}@post.runi.ac.il`;
    const result = await seedStudent(spec, email, RUNI_CS_TRACK, runiOfferings, existing);
    if (result === 'created') {
      created += 1;
    } else {
      skipped += 1;
    }
    process.stdout.write(`  ${result === 'created' ? '+' : '·'} ${spec.name} <${email}>\n`);
  }

  const tauEmail = 'demo-tau@mail.tau.ac.il';
  const tauResult = await seedStudent(TAU_STUDENT, tauEmail, null, tauOfferings, existing);
  if (tauResult === 'created') {
    created += 1;
  } else {
    skipped += 1;
  }
  process.stdout.write(`  ${tauResult === 'created' ? '+' : '·'} ${TAU_STUDENT.name} <${tauEmail}> (other tenant)\n`);

  process.stdout.write(
    `\n${created} created, ${skipped} already present. Password for all: ${PASSWORD}\n`,
  );
}

await main();
