/**
 * File:        tests/e2e/onboarding.spec.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Phase 1c exit criterion, executed: a brand-new student signs
 *              up and reaches the dashboard through all four steps.
 *
 *              This is the one test that exercises the whole stack at once —
 *              middleware guards, server actions, RLS, the database triggers
 *              and the UI. Everything else tests a layer; this tests that the
 *              layers fit together.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PASSWORD = 'onboarding-test-1234';

/** Addresses created by this run, removed afterwards. */
const created: string[] = [];

/**
 * Generates a unique student address on the seeded Reichman student domain.
 *
 * @returns An email address no other test run will collide with.
 */
function newStudentEmail(): string {
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const email = `e2e-${unique}@post.runi.ac.il`;
  created.push(email);
  return email;
}

test.afterAll(async () => {
  if (!SERVICE_KEY) {
    return;
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  for (const user of data?.users ?? []) {
    if (user.email && created.includes(user.email)) {
      await admin.auth.admin.deleteUser(user.id);
    }
  }
});

/*
 * Serial, and allowed extra time.
 *
 * These tests run against the dev server, which compiles each route the first
 * time it is requested. Four workers asking for four uncompiled routes at once
 * makes every one of them wait on the same Turbopack build and blow the default
 * 30s timeout — a failure that looks like a broken app but is really a cold
 * cache. Running in order lets each route compile once.
 */
test.describe.configure({ mode: 'serial' });

test.describe('signup and onboarding', () => {
  test.slow();

  test('a new student completes all four steps and reaches the dashboard', async ({
    page,
  }) => {
    const email = newStudentEmail();

    // ---- Sign up -----------------------------------------------------------
    await page.goto('/signup');
    await page.getByLabel('University email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('about you');

    // The university was never asked for — it is derived from the email domain.
    await expect(page.getByText('Reichman University')).toBeVisible();

    // ---- Step 1: basics ----------------------------------------------------
    await page.getByLabel('Your name').fill('Test Student');
    await page.getByLabel('Study track').selectOption({ label: 'Computer Science' });
    await page.getByLabel('Year of study').selectOption('2');
    await page.getByRole('button', { name: 'Continue' }).click();

    // ---- Step 2: courses ---------------------------------------------------
    await expect(page).toHaveURL(/\/onboarding\/courses$/);

    // Every course on the track is listed, not just those for year 2.
    const courseButtons = page.locator('button[aria-pressed]');
    await expect(courseButtons.first()).toBeVisible();
    expect(await courseButtons.count()).toBeGreaterThan(5);

    await courseButtons.nth(0).click();
    await courseButtons.nth(1).click();
    await expect(page.getByText('2 selected')).toBeVisible();

    await page.getByRole('button', { name: 'Continue' }).click();

    // ---- Step 3: preferences ----------------------------------------------
    await expect(page).toHaveURL(/\/onboarding\/preferences$/);

    /*
     * Each question is scoped to its own fieldset before picking an option.
     * Matching on text alone is ambiguous here — the visible label sits next to
     * an aria-hidden emoji and a hint line, so no element's text is exactly
     * "Morning" — and scoping also documents which question is being answered.
     */
    const question = (legend: string) => page.locator('fieldset').filter({ hasText: legend });
    const choose = (legend: string, option: string) =>
      question(legend).locator('label').filter({ hasText: option }).click();

    // Multi-select: two times of day at once, which the old single-value schema
    // could not have expressed at all.
    await choose('When do you prefer to study?', 'Morning');
    await choose('When do you prefer to study?', 'Evening');
    await choose('How do you like to work?', 'Quiet study');
    await choose('How many people?', 'Small');
    await choose('Do you study on Saturday?', 'No');

    await page.getByRole('button', { name: 'Continue' }).click();

    // ---- Step 4: availability ---------------------------------------------
    await expect(page).toHaveURL(/\/onboarding\/availability$/);

    await page.getByRole('button', { name: 'Sunday 10–12' }).click();
    await page.getByRole('button', { name: 'Tuesday 18–20' }).click();
    await expect(page.getByText('4 hours a week')).toBeVisible();

    await page.getByRole('button', { name: 'Finish setup' }).click();

    // ---- Dashboard ---------------------------------------------------------
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Test');
    await expect(page.getByText('4h')).toBeVisible();
  });

  test('rejects an address that is not a university one', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('University email').fill('someone@gmail.com');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Scoped to the form's own error element: Next renders a live-region route
    // announcer that also has role="alert", so the role alone is ambiguous.
    await expect(page.locator('#form-error')).toContainText('participating universities');
    await expect(page).toHaveURL(/\/signup$/);
  });

  test('sends a signed-out visitor to the login page', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/login/);
    // The intended destination is remembered rather than discarded.
    expect(page.url()).toContain('next=%2Fdashboard');
  });

  test('an unfinished student is returned to onboarding, not the dashboard', async ({
    page,
  }) => {
    const email = newStudentEmail();

    await page.goto('/signup');
    await page.getByLabel('University email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    // Skipping ahead is not possible while setup is incomplete.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/onboarding$/);
  });
});
