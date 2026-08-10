/**
 * File:        tests/e2e/profiles.spec.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Phase 6 exit criteria, executed: a profile shows who someone is
 *              and what you have in common, a positive rating appears on it, and a
 *              negative one appears nowhere.
 *
 *              The last of those is the assertion this file exists for, and it is
 *              checked from the browser of the person rated — the one viewer who
 *              must never see it.
 * Version:     0.18.0
 *
 * Modifications:
 *     0.18.0 - 2026-08-10 - Initial implementation (Phase 6)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PASSWORD = 'profiles-e2e-1234';

const RUNI_ID = '11111111-1111-4111-8111-111111111111';
const RUNI_CS_DEGREE = 'de600001-0000-4000-8000-000000000001';
const RUNI_CURRENT_TERM = 'dddd0002-0000-4000-8000-000000000002';

const created: string[] = [];

/**
 * Creates an onboarded student enrolled in one course.
 *
 * @param admin      - Service-role client.
 * @param email      - Their address.
 * @param fullName   - Their display name.
 * @param offeringId - The course to enroll them in.
 * @param birthDate  - Optional date of birth, so the age field has something to show.
 * @returns Their profile id.
 */
async function createStudent(
  admin: SupabaseClient,
  email: string,
  fullName: string,
  offeringId: string,
  birthDate?: string,
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
    study_formats: ['in_person', 'remote'],
  });

  await admin.from('enrollments').insert({
    profile_id: id,
    course_offering_id: offeringId,
    university_id: RUNI_ID,
  });

  await admin.from('availability_slots').insert({
    profile_id: id,
    day_of_week: 0,
    starts_at: '10:00',
    ends_at: '14:00',
  });

  if (birthDate) {
    await admin.from('profile_private').upsert({ profile_id: id, date_of_birth: birthDate });
  }

  return id;
}

test.describe.configure({ mode: 'serial' });

test.describe('student profiles', () => {
  test.slow();

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const viewerEmail = `prof-viewer-${stamp}@post.runi.ac.il`;
  const partnerEmail = `prof-partner-${stamp}@post.runi.ac.il`;

  let db: SupabaseClient;
  let offeringId = '';
  let viewerId = '';
  let partnerId = '';

  test.beforeAll(async () => {
    test.skip(!SERVICE_KEY, 'needs SUPABASE_SERVICE_ROLE_KEY in .env.local');

    db = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: offering } = await db
      .from('course_offerings')
      .select('id, courses!inner(code)')
      .eq('courses.code', 'CS-3040')
      .eq('term_id', RUNI_CURRENT_TERM)
      .single();

    offeringId = offering!.id;

    viewerId = await createStudent(db, viewerEmail, 'Vera Viewer', offeringId);
    partnerId = await createStudent(db, partnerEmail, 'Pavel Partner', offeringId, '2003-06-15');
  });

  test.afterAll(async () => {
    if (!SERVICE_KEY) {
      return;
    }

    const { data } = await db.auth.admin.listUsers({ perPage: 200 });
    for (const user of data?.users ?? []) {
      if (user.email && created.includes(user.email)) {
        await db.auth.admin.deleteUser(user.id);
      }
    }
  });

  /**
   * Signs in as one of the fixture students.
   *
   * @param page  - The Playwright page.
   * @param email - Their address.
   * @returns Nothing.
   */
  async function signIn(page: Page, email: string) {
    /*
     * Cookies cleared first, because this file switches users mid-test — the
     * negative-rating case has to be checked from the browser of the person rated.
     * The route guard sends an already-signed-in visitor away from /login, so
     * without this the second sign-in never finds a form.
     */
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('University email').pressSequentially(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  test('a profile shows who they are and what you share', async ({ page }) => {
    await signIn(page, viewerEmail);
    await page.goto(`/students/${partnerId}`);

    await expect(page.getByRole('heading', { level: 1, name: 'Pavel Partner' })).toBeVisible();

    /* Degree, year and the age derived from a date of birth the viewer cannot read. */
    await expect(page.getByText(/Computer Science · Year 2 · \d+/)).toBeVisible();
    await expect(page.getByText('Reichman University')).toBeVisible();

    /* The onboarding answers. */
    await expect(page.getByRole('heading', { name: /How Pavel study/ })).toBeVisible();
    await expect(page.getByText('Morning')).toBeVisible();
    await expect(page.getByText('Quiet study')).toBeVisible();
    await expect(page.getByText('Not on Saturday')).toBeVisible();

    /* Viewer context: the shared course, and a real compatibility score. */
    await expect(page.getByRole('list', { name: 'Shared courses' })).toContainText('CS-3040');
    await expect(page.getByText('Compatibility')).toBeVisible();
    await expect(page.getByText(/^\d+%$/)).toBeVisible();
  });

  test('the profile is reachable from a match card', async ({ page }) => {
    await signIn(page, viewerEmail);

    await page.getByRole('link', { name: 'Pavel Partner' }).first().click();

    await expect(page).toHaveURL(new RegExp(`/students/${partnerId}$`));
  });

  test('rating is offered only after you have talked', async ({ page }) => {
    await signIn(page, viewerEmail);
    await page.goto(`/students/${partnerId}`);

    /* No conversation yet, so the control is absent rather than disabled. */
    await expect(page.getByRole('button', { name: /Rate your session/ })).toHaveCount(0);

    /* Start one the way a student would. */
    await page.getByRole('button', { name: /Send message to Pavel Partner/ }).click();
    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/, { timeout: 20_000 });

    await page.goto(`/students/${partnerId}`);
    await expect(page.getByRole('button', { name: /Rate your session/ })).toBeVisible();
  });

  test('a positive rating appears publicly on their profile', async ({ page }) => {
    await signIn(page, viewerEmail);
    await page.goto(`/students/${partnerId}`);

    await page.getByRole('button', { name: /Rate your session/ }).click();

    const dialog = page.getByRole('dialog');
    /* The dialog states what each choice does before it is made. */
    await expect(dialog.getByText(/Shown on Pavel's profile with your name/)).toBeVisible();
    await expect(dialog.getByText(/Completely private\. Pavel is never told/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Save' }).click();

    /* It is on the profile, naming the rater, and the button reflects it. */
    await expect(page.getByRole('list', { name: 'Study connections' })).toContainText(
      'Vera Viewer',
      { timeout: 15_000 },
    );
    await expect(page.getByText(/Studied with 1 classmate through StudyBuddy/)).toBeVisible();
    await expect(page.getByRole('button', { name: /You studied together/ })).toBeVisible();
  });

  test('the rated student sees the positive connection on their own profile', async ({ page }) => {
    await signIn(page, partnerEmail);
    await page.goto(`/students/${partnerId}`);

    await expect(page.getByRole('list', { name: 'Study connections' })).toContainText(
      'Vera Viewer',
    );
    /* Their own profile offers editing rather than rating. */
    await expect(page.getByRole('link', { name: 'Edit your profile' })).toBeVisible();
  });

  test('a negative rating appears NOWHERE on the rated student’s profile', async ({ page }) => {
    /* The viewer changes their mind, through the UI. */
    await signIn(page, viewerEmail);
    await page.goto(`/students/${partnerId}`);
    await page.getByRole('button', { name: /You studied together/ }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByText('It did not work out').click();
    await dialog.getByLabel(/Anything we should know/).fill('Did not turn up.');
    await dialog.getByRole('button', { name: 'Update' }).click();

    /* From the rater's side it is acknowledged, privately. */
    await expect(page.getByRole('button', { name: /Your private note/ })).toBeVisible({
      timeout: 15_000,
    });
    /* And the public connection is gone, because it is no longer positive. */
    await expect(page.getByText(/Studied with 1 classmate/)).toHaveCount(0);

    /*
     * THE ASSERTION THIS FILE EXISTS FOR. Now look from the browser of the person
     * who was rated. They must find no trace: no note, no count, no hint that
     * anything was said about them at all.
     */
    await signIn(page, partnerEmail);
    await page.goto(`/students/${partnerId}`);

    const body = page.locator('body');
    await expect(body).not.toContainText('Did not turn up');
    await expect(body).not.toContainText(/did not work out/i);
    await expect(body).not.toContainText(/negative/i);
    /* The connections section is empty, not "0 of 1". */
    await expect(page.getByText('None yet.')).toBeVisible();
    await expect(page.getByText(/Studied with/)).toHaveCount(0);
  });

  test('a profile at another university is a 404', async ({ page }) => {
    const { data: tau } = await db
      .from('profiles')
      .select('id')
      .eq('university_id', '22222222-2222-4222-8222-222222222222')
      .limit(1)
      .maybeSingle();

    test.skip(!tau, 'needs a seeded Tel Aviv student');

    await signIn(page, viewerEmail);

    /* Cross-tenant isolation, on the newest route. Not found rather than
       forbidden, so a guessed id cannot confirm that somebody exists. */
    const response = await page.goto(`/students/${tau!.id}`);

    expect(response?.status()).toBe(404);
  });
});
