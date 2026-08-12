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
 * Version:     0.13.0
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Registration now ends at the emailed code (Phase 9A)
 *     0.13.0 - 2026-08-10 - Typed rather than filled in the preservation test,
 *                           which was flaking on WebKit
 *     0.11.0 - 2026-08-09 - Placeholder catalog and the course requirement
 *     0.10.0 - 2026-08-09 - Law-degree course filtering regression test
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import { createClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

import { waitForVerificationCode } from './helpers/mailbox';

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

/**
 * Registers a student and confirms the address, ending in onboarding.
 *
 * SINCE PHASE 9A THIS IS TWO STEPS, not one. Sign-up leaves the student on the
 * code screen with no session at all — the account exists but cannot be used —
 * and the code has to come out of the mail server, because reading it is the
 * only thing that proves the email template still carries one.
 *
 * @param page  - The Playwright page.
 * @param email - The address to register.
 * @returns Nothing; leaves the browser on /onboarding.
 */
async function registerStudent(page: Page, email: string) {
  await page.goto('/signup');
  await page.getByLabel('University email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/verify-email/);

  const code = await waitForVerificationCode(email);
  await page.getByLabel('Verification code').fill(code);
  await page.getByRole('button', { name: 'Confirm my account' }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
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

    // ---- Sign up, and confirm the address ----------------------------------
    await registerStudent(page, email);

    await expect(page.getByRole('heading', { level: 1 })).toContainText('about you');

    // Shown, but read-only: derived from the email domain, never chosen.
    const university = page.getByLabel('University');
    await expect(university).toHaveValue('Reichman University');
    await expect(university).toHaveAttribute('readonly', '');

    // ---- Step 1: academic and personal profile -----------------------------
    await page.getByLabel('Your name').fill('Test Student');
    await page.getByLabel('Degree level').selectOption('bachelors');
    await page.getByLabel('Degree', { exact: true }).selectOption({ label: 'Computer Science' });
    // Study track was removed: degree level and degree are the only academic
    // classification now.
    await expect(page.getByLabel('Study track')).toHaveCount(0);
    await page.getByLabel('Year of study').selectOption('2');
    await page.getByLabel('City').fill('Tel Aviv');
    await page.getByLabel('Date of birth').fill('2003-06-15');
    await page.getByRole('button', { name: 'Continue' }).click();

    // ---- Step 2: courses ---------------------------------------------------
    await expect(page).toHaveURL(/\/onboarding\/courses$/);

    /*
     * The Computer Science catalog, and only it. A Law student seeing these was
     * the filtering bug; the heading naming the degree is what proves the list is
     * scoped rather than the whole university.
     */
    await expect(page.getByRole('heading', { name: 'Computer Science' })).toBeVisible();
    const courseButtons = page.locator('button[aria-pressed]');
    await expect(courseButtons.first()).toBeVisible();
    expect(await courseButtons.count()).toBeGreaterThan(5);

    /*
     * Nothing chosen yet, so Continue is closed. Matching runs on shared
     * courses, so a student who leaves this step with none is unmatchable and
     * the three steps after it cannot help them.
     */
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await expect(page.getByText(/Choose a course first/)).toBeVisible();

    await courseButtons.nth(0).click();
    await courseButtons.nth(1).click();
    await expect(page.getByText('2 selected')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();

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
    /*
     * "In person" is pre-selected, so clicking it would UNCHECK it. Adding
     * "Remote" instead exercises the multi-select and leaves both chosen — which
     * is also the answer that matches the widest set of classmates.
     */
    await expect(
      question('How do you want to meet?').getByRole('checkbox', { name: /In person/ }),
    ).toBeChecked();
    await choose('How do you want to meet?', 'Remote');

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

  test('keeps the email when only the password is rejected', async ({ page }) => {
    const email = newStudentEmail();

    await page.goto('/signup');

    /*
     * Typed, not filled, and only in this test.
     *
     * `fill()` sets the DOM value directly. On WebKit that sometimes lands
     * without React's onChange firing, which leaves the input showing the text
     * while the component's state is still empty — and this is the one test whose
     * assertion comes AFTER a re-render, so the controlled value is re-applied
     * from that empty state and the field blanks. The failure looked exactly like
     * the bug this test exists to catch, which is the worst kind of flake.
     *
     * pressSequentially sends real keystrokes, so state and DOM agree, the same
     * way they do for a student typing.
     */
    await page.getByLabel('University email').pressSequentially(email);
    await page.getByLabel('Password', { exact: true }).fill('short');

    /* State really holds it before the action runs. */
    await expect(page.getByLabel('University email')).toHaveValue(email);

    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.locator('#form-error')).toContainText('at least 8');

    // The whole point of the fix: React 19 resets an uncontrolled form once its
    // action returns, so a rejected password used to wipe a perfectly good
    // address too. The email is controlled and survives; the password is not,
    // and is cleared for retyping.
    await expect(page.getByLabel('University email')).toHaveValue(email);
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  });

  test('accepts any academic address, provisioning the institution on first sight', async ({
    page,
  }) => {
    // A .edu domain nobody has used before: it is not in the seed, so signing
    // up has to create the institution and its default tracks or step 1 would
    // have an empty dropdown.
    const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const email = `e2e-${unique}@newcollege.edu`;
    created.push(email);

    await registerStudent(page, email);

    // The institution name is derived from the domain.
    await expect(page.getByLabel('University')).toHaveValue('Newcollege');

    // Provisioning must create degrees, or step 1 would have an empty dropdown.
    const degreeOptions = page.getByLabel('Degree', { exact: true }).locator('option');
    expect(await degreeOptions.count()).toBeGreaterThan(1);
  });

  test('pre-fills the name from the email, and lets it be edited', async ({ page }) => {
    // Numeric suffix, which also exercises the trailing-digit strip: an
    // enrolment number on the end of a name is not part of the name.
    const email = `dana.levi${Date.now()}@post.runi.ac.il`;
    created.push(email);

    await registerStudent(page, email);

    await expect(page.getByLabel('Your name')).toHaveValue('Dana Levi');

    // A guess, not a decision — it must remain editable.
    await page.getByLabel('Your name').fill('Dana L.');
    await expect(page.getByLabel('Your name')).toHaveValue('Dana L.');
  });

  test('offers the chosen degree its own courses, and only those', async ({ page }) => {
    const email = newStudentEmail();

    await registerStudent(page, email);

    await page.getByLabel('Your name').fill('Law Student');
    await page.getByLabel('Degree level').selectOption('bachelors');
    await page.getByLabel('Degree', { exact: true }).selectOption({ label: 'Law' });
    await page.getByLabel('Year of study').selectOption('1');
    await page.getByLabel('City').fill('Tel Aviv');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(/\/onboarding\/courses$/);

    /*
     * Law has no seeded catalog, so this exercises the fallback end to end: the
     * page renders empty, the picker asks /api/courses, and the API stores and
     * returns the stock Law curriculum. An empty list here would be a dead end,
     * since a student with no courses cannot be matched on anything.
     */
    await expect(page.getByRole('button', { name: /Introduction to Law/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: /Constitutional Law/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Contract Law/ })).toBeVisible();

    /* The original bug: another degree's courses appearing under Law. */
    await expect(page.getByRole('button', { name: /Computer Science/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Discrete Mathematics/ })).toHaveCount(0);

    /* Provenance is stated: this is not the university's real syllabus. */
    await expect(page.getByText(/standard course list for Law/i)).toBeVisible();

    /* And the requirement holds on a generated catalog too. */
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await page.getByRole('button', { name: /Constitutional Law/ }).click();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(/\/onboarding\/preferences$/);
  });

  test('rejects an address that is not a university one', async ({ page }) => {
    await page.goto('/signup');
    await page.getByLabel('University email').fill('someone@gmail.com');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // Scoped to the form's own error element: Next renders a live-region route
    // announcer that also has role="alert", so the role alone is ambiguous.
    await expect(page.locator('#form-error')).toContainText('.ac.il or .edu');
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

    await registerStudent(page, email);

    // Skipping ahead is not possible while setup is incomplete.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/onboarding$/);
  });
});
