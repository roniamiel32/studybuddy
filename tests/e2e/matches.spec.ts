/**
 * File:        tests/e2e/matches.spec.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: End-to-end proof that the matches dashboard shows real people
 *              from the database with real scores — the Phase 2 deliverable.
 *
 *              Creates its own pair of students rather than relying on
 *              `npm run seed:students`, so the test passes on a freshly reset
 *              database and cannot silently depend on demo data.
 * Version:     0.10.0
 *
 * Modifications:
 *     0.10.0 - 2026-08-09 - Assertions updated for degrees
 *     0.8.0 - 2026-08-05 - Initial implementation (Phase 2)
 */

import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PASSWORD = 'matches-e2e-1234';

const RUNI = '11111111-1111-4111-8111-111111111111';
const RUNI_CS_DEGREE = 'de600001-0000-4000-8000-000000000001';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Math.random().toString(36).slice(2, 8);
const viewerEmail = `matches-viewer-${stamp}@post.runi.ac.il`;
const partnerEmail = `matches-partner-${stamp}@post.runi.ac.il`;
const created: string[] = [];

/**
 * Creates a fully matchable student.
 *
 * @param email - Their address.
 * @param name  - Display name.
 * @returns Their profile id.
 */
async function makeStudent(email: string, name: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`${email}: ${error?.message}`);
  }

  const id = data.user.id;
  created.push(id);

  await admin
    .from('profiles')
    .update({
      full_name: name,
      degree_id: RUNI_CS_DEGREE,
      year_of_study: 2,
      is_discoverable: true,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', id);

  await admin.from('learning_preferences').insert({
    profile_id: id,
    preferred_time_blocks: ['morning'],
    study_environments: ['quiet'],
    group_sizes: ['small'],
    studies_on_saturday: false,
    spoken_languages: ['he'],
  });

  await admin.from('availability_slots').insert([
    { profile_id: id, day_of_week: 0, starts_at: '10:00', ends_at: '14:00' },
    { profile_id: id, day_of_week: 2, starts_at: '10:00', ends_at: '14:00' },
  ]);

  const { data: offering } = await admin
    .from('course_offerings')
    .select('id, courses!inner(code), terms!inner(is_current)')
    .eq('courses.code', 'CS-3040')
    .eq('terms.is_current', true)
    .single();

  await admin.from('enrollments').insert({
    profile_id: id,
    course_offering_id: offering!.id,
    university_id: RUNI,
  });

  return id;
}

test.beforeAll(async () => {
  await makeStudent(viewerEmail, 'Viewer Student');
  await makeStudent(partnerEmail, 'Perfect Partner');
});

test.afterAll(async () => {
  for (const id of created) {
    await admin.auth.admin.deleteUser(id);
  }
});

test.describe.configure({ mode: 'serial' });

test.describe('matches dashboard', () => {
  test.slow();

  test('shows a real classmate with a real score', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('University email').fill(viewerEmail);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Viewer');

    // The partner comes from the database, not a fixture in the markup.
    await expect(page.getByText('Perfect Partner')).toBeVisible();

    // Identical preferences and 8 hours of shared time: a high score, and the
    // shared days spelled out rather than a raw minute count.
    await expect(page.getByText(/% match/)).toBeVisible();
    await expect(page.getByText('Sun, Tue · 8h a week')).toBeVisible();
    await expect(page.getByText('CS-3040').first()).toBeVisible();
  });

  test('explains why a match was made when asked', async ({ page }) => {
    // A second partner puts someone in the grid, where the disclosure lives.
    const secondEmail = `matches-second-${stamp}@post.runi.ac.il`;
    await makeStudent(secondEmail, 'Second Partner');

    await page.goto('/login');
    await page.getByLabel('University email').fill(viewerEmail);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    const why = page.getByRole('button', { name: /Why this match/ }).first();
    await why.click();

    await expect(page.locator('[id^=match-details-]').first()).toContainText('Shares 1 course');
  });

  test('navigation reflects where you are', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('University email').fill(viewerEmail);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    /*
     * The menu holds Courses, Groups and Messages. Match is the call to action and
     * deliberately NOT in the nav landmark, so it is asserted on the header — which
     * is also what proves the redesign actually moved it rather than duplicating it.
     */
    /*
     * `.last()` rather than `.first()`: both bars are in the DOM at every width and
     * only one is displayed, and the mobile bar comes second. Asserting visibility
     * against the hidden one would fail for a reason that has nothing to do with
     * the navigation being right.
     */
    const nav = page
      .getByRole('navigation', { name: 'Main' })
      .filter({ visible: true })
      .first();
    await expect(nav.getByRole('link', { name: 'Courses' })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Groups/ })).toBeVisible();
    await expect(nav.getByRole('link', { name: /Messages/ })).toBeVisible();
    /* The design's "Chat" tab is called Messages here (design conflict C2). */
    await expect(nav.getByRole('link', { name: 'Chat' })).toHaveCount(0);

    /*
     * Match lives in a different place on each breakpoint, and that is the design
     * rather than an accident: a fixed bottom bar has no room for a call-to-action
     * pill, so on a phone Match stays a tab. The invariant that holds either way is
     * that there is exactly one Match link and it knows it is the current page.
     */
    const header = page.getByRole('banner');
    const isDesktop = (page.viewportSize()?.width ?? 0) >= 768;
    const match = isDesktop
      ? header.getByRole('link', { name: 'Match' })
      : page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Match' });

    await expect(match).toHaveAttribute('aria-current', 'page');

    /* On desktop it is deliberately outside the nav landmark. */
    if (isDesktop) {
      await expect(nav.getByRole('link', { name: 'Match' })).toHaveCount(0);
    }

    /* Profile and Sign out live in the user menu now, not loose in the header. */
    await expect(header.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
    /*
     * The <summary> IS the control, so it is clicked directly. Not by role:
     * <details>/<summary> is exposed inconsistently across engines, and an sr-only
     * label inside it would sit behind the avatar and be unclickable.
     */
    await header.locator('summary').click();
    await expect(header.getByRole('link', { name: 'Profile' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });
});
