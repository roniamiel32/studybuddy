/**
 * File:        tests/e2e/courses.spec.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Phase 4 exit criteria, executed: the Courses grid, adding and
 *              dropping a course, the per-course page showing only that course's
 *              classmates, the override modal, and the Profile tab.
 *
 *              The assertion that matters most is the override one. The
 *              integration suite already proves an override changes the SQL
 *              ranking; this proves the modal actually writes it and the page
 *              reports what is in force — a screen that saves nothing while
 *              looking correct would pass every other test in the project.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PASSWORD = 'courses-e2e-1234';

const RUNI_ID = '11111111-1111-4111-8111-111111111111';
const RUNI_CS_DEGREE = 'de600001-0000-4000-8000-000000000001';
const RUNI_CURRENT_TERM = 'dddd0002-0000-4000-8000-000000000002';

const created: string[] = [];

/**
 * Creates a fully onboarded student enrolled in the given courses.
 *
 * @param admin      - Service-role client.
 * @param email      - Their address.
 * @param fullName   - Their display name.
 * @param offerings  - Courses to enroll them in.
 * @param formats    - Their global study formats.
 * @returns Their profile id.
 */
async function createStudent(
  admin: SupabaseClient,
  email: string,
  fullName: string,
  offerings: string[],
  formats: string[] = ['in_person', 'remote'],
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`could not create ${email}: ${error?.message}`);
  }

  created.push(email);
  const id = data.user.id;

  await admin
    .from('profiles')
    .update({
      full_name: fullName,
      degree_id: RUNI_CS_DEGREE,
      year_of_study: 2,
      city: 'Herzliya',
      is_discoverable: true,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', id);

  await admin.from('learning_preferences').upsert({
    profile_id: id,
    preferred_time_blocks: ['morning'],
    study_environments: ['quiet'],
    group_sizes: ['small'],
    studies_on_saturday: false,
    spoken_languages: ['he', 'en'],
    study_formats: formats,
  });

  for (const offering of offerings) {
    await admin.from('enrollments').insert({
      profile_id: id,
      course_offering_id: offering,
      university_id: RUNI_ID,
    });
  }

  await admin.from('availability_slots').insert({
    profile_id: id,
    day_of_week: 0,
    starts_at: '10:00',
    ends_at: '14:00',
  });

  return id;
}

test.describe.configure({ mode: 'serial' });

test.describe('courses and profile', () => {
  test.slow();

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const mineEmail = `courses-me-${stamp}@post.runi.ac.il`;
  const remoteEmail = `courses-remote-${stamp}@post.runi.ac.il`;

  let admin: SupabaseClient;
  let mineId = '';
  let firstOffering = '';
  let secondOffering = '';

  test.beforeAll(async () => {
    test.skip(!SERVICE_KEY, 'needs SUPABASE_SERVICE_ROLE_KEY in .env.local');

    admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const offeringByCode = async (code: string) => {
      const { data } = await admin
        .from('course_offerings')
        .select('id, courses!inner(code)')
        .eq('courses.code', code)
        .eq('term_id', RUNI_CURRENT_TERM)
        .single();

      return data!.id as string;
    };

    firstOffering = await offeringByCode('CS-3040');
    secondOffering = await offeringByCode('CS-2010');

    /* The viewer takes both courses. */
    mineId = await createStudent(admin, mineEmail, 'Grid Student', [firstOffering, secondOffering]);
    /* A remote-only classmate, in both courses, for the override test. */
    await createStudent(
      admin,
      remoteEmail,
      'Remote Classmate',
      [firstOffering, secondOffering],
      ['remote'],
    );
  });

  test.afterAll(async () => {
    if (!SERVICE_KEY) {
      return;
    }

    const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
    for (const user of data?.users ?? []) {
      if (user.email && created.includes(user.email)) {
        await admin.auth.admin.deleteUser(user.id);
      }
    }
  });

  /**
   * Signs the viewer in.
   *
   * @param page - The Playwright page.
   * @returns Nothing.
   */
  /**
   * Puts the viewer back to exactly two courses.
   *
   * Called before every test. These tests add and drop courses, so without this
   * each one inherits whatever the previous one left behind — and a test that
   * passes in isolation then fails in a full run for reasons that have nothing to
   * do with what it is checking. Written through the admin client because it is
   * setup, not the behaviour under test.
   */
  async function resetEnrollments() {
    await admin.from('enrollments').delete().eq('profile_id', mineId);

    for (const offering of [firstOffering, secondOffering]) {
      const { error } = await admin.from('enrollments').insert({
        profile_id: mineId,
        course_offering_id: offering,
        university_id: RUNI_ID,
      });

      if (error) {
        throw new Error(`could not restore enrolment: ${error.message}`);
      }
    }
  }

  /** The course grid, distinct from the add-a-course picker's own list. */
  function grid(page: import('@playwright/test').Page) {
    return page.getByRole('list', { name: 'Your courses' });
  }

  test.beforeEach(async () => {
    if (SERVICE_KEY) {
      await resetEnrollments();
    }
  });

  async function signIn(page: import('@playwright/test').Page) {
    await page.goto('/login');
    await page.getByLabel('University email').pressSequentially(mineEmail);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  test('the grid shows the courses the student is taking', async ({ page }) => {
    await signIn(page);

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Courses' }).click();
    await expect(page).toHaveURL(/\/courses$/);

    await expect(page.getByRole('heading', { level: 1, name: 'Your courses' })).toBeVisible();

    /* Both enrolled courses, each a card linking to its own page. */
    await expect(grid(page).getByRole('listitem')).toHaveCount(2);
    await expect(page.getByText('CS-3040').first()).toBeVisible();
    await expect(page.getByText('CS-2010').first()).toBeVisible();

    /*
     * The classmate count is real, not decorative. Asserted as "some number of
     * classmates" rather than an exact figure: the seeded demo cohort is enrolled
     * in these courses too, so a hard-coded 1 would break the moment the seed
     * changes — and the seed is not what this test is about.
     */
    await expect(page.getByText(/\d+ classmates?/).first()).toBeVisible();
  });

  test('a course can be added and then dropped', async ({ page }) => {
    await signIn(page);
    await page.goto('/courses');

    await page.getByRole('button', { name: 'Add a course' }).click();
    await expect(page.getByRole('heading', { name: 'Add a course' })).toBeVisible();

    /* Whatever the degree offers that they are not already in. */
    const first = page.getByRole('button', { name: /CS-/ }).first();
    const label = (await first.textContent()) ?? '';
    const code = /CS-\d+/.exec(label)?.[0] ?? '';
    expect(code).not.toBe('');

    await first.click();

    await expect(grid(page).getByRole('listitem').filter({ hasText: code })).toBeVisible();
    await expect(grid(page).getByRole('listitem')).toHaveCount(3);

    /* And back out again, through the two-step confirmation. */
    const card = grid(page).getByRole('listitem').filter({ hasText: code });
    await card.getByRole('button', { name: /^Drop / }).click();
    await card.getByRole('button', { name: /^Confirm dropping/ }).click();

    await expect(grid(page).getByRole('listitem')).toHaveCount(2);
  });

  test('the last course cannot be dropped', async ({ page }) => {
    await signIn(page);
    await page.goto('/courses');

    /* Down to one course, so the control should be gone entirely. */
    const card = grid(page).getByRole('listitem').filter({ hasText: 'CS-2010' });
    await card.getByRole('button', { name: /^Drop / }).click();
    await card.getByRole('button', { name: /^Confirm dropping/ }).click();

    await expect(grid(page).getByRole('listitem')).toHaveCount(1);

    /*
     * Matching is anchored to a shared course, so a student with none is
     * unmatchable. Offering the control and then refusing would be worse than
     * not offering it.
     */
    await expect(page.getByRole('button', { name: /^Drop / })).toHaveCount(0);
  });

  test('a course page shows only that course’s classmates', async ({ page }) => {
    await signIn(page);
    await page.goto(`/courses/${firstOffering}`);

    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('CS-3040');
    await expect(page.getByRole('heading', { name: 'Find partners' })).toBeVisible();

    /* The classmate shares both courses, but this page is scoped to one. */
    await expect(page.getByText('Remote Classmate')).toBeVisible();
    await expect(page.getByText(/matches? in CS-3040/)).toBeVisible();

    /* The score badge is on the card, so this really is the matching engine. */
    await expect(page.getByText(/%$/).first()).toBeVisible();
  });

  test('preferences can be overridden for one course only', async ({ page }) => {
    await signIn(page);
    await page.goto(`/courses/${firstOffering}`);

    await expect(page.getByText('This course uses your global preferences.')).toBeVisible();

    await page.getByRole('button', { name: 'Edit preferences for this course' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /Preferences for CS-3040/ })).toBeVisible();

    /* Each question states the global answer, so the student knows what they are
       changing. */
    await expect(dialog.getByText(/Your default: In person, Remote/)).toBeVisible();

    /* In person only, for this course. */
    const meeting = dialog.locator('fieldset').filter({ hasText: 'How do you want to meet' });
    await meeting.locator('label').filter({ hasText: 'Remote' }).click();

    await dialog.getByRole('button', { name: 'Save for this course' }).click();

    /* The page now reports the override, and says how much differs. */
    await expect(page.getByText(/differs? from your defaults/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('This course uses its own answers, not your defaults.')).toBeVisible();

    /*
     * And it reached the ranking: the remote-only classmate is filtered out of
     * THIS course by the strict format filter.
     */
    await expect(page.getByText('Remote Classmate')).toHaveCount(0);

    /* The other course is untouched — the override is per course, not global. */
    await page.goto(`/courses/${secondOffering}`);
    await expect(page.getByText('This course uses your global preferences.')).toBeVisible();
    await expect(page.getByText('Remote Classmate')).toBeVisible();

    /* The grid flags which course carries one. */
    await page.goto('/courses');
    const overridden = grid(page).getByRole('listitem').filter({ hasText: 'CS-3040' });
    await expect(overridden.getByText('Custom here')).toBeVisible();
  });

  test('an override can be cleared back to the global answer', async ({ page }) => {
    /*
     * Sets its own override first. The previous test creates one through the modal,
     * but depending on that would make this test fail whenever that one does — and
     * the reset before each test deliberately wipes it anyway.
     */
    const { error } = await admin
      .from('enrollments')
      .update({ study_formats: ['in_person'] })
      .eq('profile_id', mineId)
      .eq('course_offering_id', firstOffering);

    expect(error).toBeNull();

    await signIn(page);
    await page.goto(`/courses/${firstOffering}`);

    /* Confirm the starting state, so a pass cannot mean "there was nothing to clear". */
    await expect(
      page.getByText('This course uses its own answers, not your defaults.'),
    ).toBeVisible();
    await expect(page.getByText('Remote Classmate')).toHaveCount(0);

    await page.getByRole('button', { name: 'Edit preferences for this course' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Go back to my global preferences' })
      .click();

    await expect(page.getByText('This course uses your global preferences.')).toBeVisible({
      timeout: 15_000,
    });

    /* The classmate the override had filtered out is back. */
    await expect(page.getByText('Remote Classmate')).toBeVisible();
  });

  test('a course the student is not enrolled in is a 404', async ({ page }) => {
    await signIn(page);

    /* A well-formed offering id that is not theirs. Telling "not enrolled" apart
       from "no such course" would confirm the course exists. */
    const response = await page.goto('/courses/0e1d4a2b-0000-4000-8000-000000000999');

    expect(response?.status()).toBe(404);
  });

  test('the Profile tab saves global preferences', async ({ page }) => {
    await signIn(page);

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Profile' }).click();
    await expect(page).toHaveURL(/\/settings$/);

    await expect(page.getByRole('heading', { level: 1, name: 'Your profile' })).toBeVisible();
    /* The photo section, and the derived context that is deliberately read-only. */
    await expect(page.getByRole('heading', { name: 'Your photo' })).toBeVisible();
    await expect(page.getByText('Reichman University')).toBeVisible();

    const preferences = page.locator('section').filter({ hasText: 'How you like to study' });
    const times = preferences.locator('fieldset').filter({ hasText: 'When do you prefer to study' });

    await times.locator('label').filter({ hasText: 'Evening' }).click();
    await preferences.getByRole('button', { name: 'Save preferences' }).click();

    await expect(page.getByText('Preferences saved. Your matches are re-ranked.')).toBeVisible({
      timeout: 15_000,
    });

    /* It really persisted: a reload shows the new answer selected. */
    await page.reload();
    await expect(
      page
        .locator('section')
        .filter({ hasText: 'How you like to study' })
        .locator('fieldset')
        .filter({ hasText: 'When do you prefer to study' })
        .getByRole('checkbox', { name: /Evening/ }),
    ).toBeChecked();
  });

  test('the Profile tab warns that a customised course keeps its own answers', async ({ page }) => {
    /*
     * The override is set through the database rather than the modal.
     *
     * Test 5 already proves the modal writes it; driving that flow again here
     * would test the same thing twice and make THIS assertion depend on it. When
     * it did, this test failed in a full run for a reason that had nothing to do
     * with the Profile tab — the thing it is actually about.
     */
    const { error } = await admin
      .from('enrollments')
      .update({ study_formats: ['in_person'] })
      .eq('profile_id', mineId)
      .eq('course_offering_id', firstOffering);

    expect(error).toBeNull();

    await signIn(page);
    await page.goto('/settings');

    /*
     * Without this line a student changes their global answer, sees one course
     * not move, and concludes the save is broken.
     */
    await expect(
      page.getByText(/of your courses have their own answers|has its own answers/),
    ).toBeVisible();
  });
});
