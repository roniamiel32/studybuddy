/**
 * File:        tests/e2e/account.spec.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Phase 9A account flows, executed: staying signed in, getting
 *              back in after forgetting a password, changing one from inside the
 *              app, and leaving for good.
 *
 *              THESE ARE THE TESTS THAT HAVE TO USE THE MAIL SERVER. Every one
 *              of these flows has a step that happens outside the browser, and
 *              a test that mints its own token proves the half that was never
 *              going to break.
 * Version:     0.23.0
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Initial implementation (Phase 9A)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

import { clearMailbox, waitForResetLink, waitForVerificationCode } from './helpers/mailbox';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PASSWORD = 'account-e2e-1234';

/** Addresses created by this run, removed afterwards. */
const created: string[] = [];

/**
 * A unique address on the seeded Reichman student domain.
 *
 * @returns An address no other run will collide with.
 */
function newStudentEmail(): string {
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const email = `acct-${unique}@post.runi.ac.il`;
  created.push(email);
  return email;
}

/**
 * Registers and confirms a student, leaving them in onboarding.
 *
 * @param page  - The Playwright page.
 * @param email - The address to register.
 * @returns Nothing.
 */
async function register(page: Page, email: string) {
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

test.describe.configure({ mode: 'serial' });

test.describe('account flows', () => {
  test.slow();

  let db: SupabaseClient;

  test.beforeAll(async () => {
    test.skip(!SERVICE_KEY, 'needs SUPABASE_SERVICE_ROLE_KEY in .env.local');

    db = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  test.beforeEach(async () => {
    /* Each test reads "the newest email to this address"; a mailbox left full
       from the previous one is how that reads the wrong message. */
    await clearMailbox();
  });

  // ---- 3. Email verification ------------------------------------------------

  test('an account cannot be used until the emailed code is entered', async ({ page }) => {
    const email = newStudentEmail();

    await page.goto('/signup');
    await page.getByLabel('University email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    /* Registration stops here, and this is the assertion the whole feature
       rests on: an account exists, and it is not a session. */
    await expect(page).toHaveURL(/\/verify-email/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Confirm your email');

    /* Signing in with the right password gets them the code screen, not the
       dashboard — the account is real but unusable. */
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('University email').pressSequentially(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/verify-email/);

    /* A wrong code is refused rather than waved through. */
    await page.getByLabel('Verification code').fill('000000');
    await page.getByRole('button', { name: 'Confirm my account' }).click();
    await expect(page.locator('#form-error')).toContainText('did not work');

    const code = await waitForVerificationCode(email);
    await page.getByLabel('Verification code').fill(code);
    await page.getByRole('button', { name: 'Confirm my account' }).click();

    await expect(page).toHaveURL(/\/onboarding$/);
  });

  // ---- 1. Keep me signed in -------------------------------------------------

  test('the session cookie outlives the browser only when asked to', async ({ page }) => {
    const email = newStudentEmail();
    await register(page, email);

    /**
     * The auth cookies, with whatever lifetime they were set with.
     *
     * @returns Every Supabase auth cookie in the context.
     */
    const authCookies = async () =>
      (await page.context().cookies()).filter((cookie) => cookie.name.startsWith('sb-'));

    // Unticked: session cookies, which Playwright reports with expires = -1.
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('University email').pressSequentially(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('checkbox', { name: 'Keep me signed in' }).uncheck();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    const transient = await authCookies();
    expect(transient.length).toBeGreaterThan(0);
    for (const cookie of transient) {
      expect(cookie.expires, `${cookie.name} should expire with the browser`).toBe(-1);
    }

    // Ticked: the same cookies, now with a real expiry.
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('University email').pressSequentially(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('checkbox', { name: 'Keep me signed in' }).check();
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/onboarding$/);

    const persistent = await authCookies();
    expect(persistent.length).toBeGreaterThan(0);
    expect(
      persistent.some((cookie) => cookie.expires > Date.now() / 1000),
      'at least one auth cookie should outlive the browser',
    ).toBe(true);
  });

  // ---- 2. Forgot password ---------------------------------------------------

  test('a forgotten password can be reset from the emailed link', async ({ page }) => {
    const email = newStudentEmail();
    await register(page, email);
    await page.context().clearCookies();

    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Find your account');

    await page.getByLabel('University email').pressSequentially(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Check your email');

    await page.goto(await waitForResetLink(email));
    await expect(page).toHaveURL(/\/reset-password$/);

    // Double confirmation: mismatched halves are refused.
    const newPassword = 'reset-e2e-5678';
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Re-enter new password').fill('something-else-entirely');
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.locator('#form-error')).toContainText('not the same');

    await page.getByLabel('Re-enter new password').fill(newPassword);
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page).toHaveURL(/\/dashboard$|\/onboarding$/);

    // The new password works, and the old one does not.
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('University email').pressSequentially(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#form-error')).toContainText('did not match');

    await page.getByLabel('Password', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$|\/onboarding$/);
  });

  // ---- 4 and 5. Change password, delete account -----------------------------

  test('the password can be changed, and the account deleted, from settings', async ({
    page,
  }) => {
    const email = newStudentEmail();
    await register(page, email);

    /*
     * Settings needs a finished profile — it redirects to onboarding without
     * preferences. Completing four onboarding steps through the UI is already
     * covered by onboarding.spec; here it is setup, so it goes in by hand.
     */
    const { data: found } = await db.auth.admin.listUsers({ perPage: 200 });
    const userId = found.users.find((user) => user.email === email)!.id;

    await db
      .from('profiles')
      .update({ full_name: 'Account Tester', onboarding_completed_at: new Date().toISOString() })
      .eq('id', userId);
    await db.from('learning_preferences').upsert({
      profile_id: userId,
      preferred_time_blocks: ['morning'],
      study_environments: ['quiet'],
      study_formats: ['in_person'],
      group_sizes: ['small'],
      spoken_languages: ['he'],
      studies_on_saturday: false,
    });

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible();

    // The current password is genuinely checked.
    const newPassword = 'changed-e2e-9012';
    await page.getByLabel('Current password').fill('not-my-password');
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Re-enter new password').fill(newPassword);
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.locator('#form-error')).toContainText('not your current password');

    await page.getByLabel('Current password').fill(PASSWORD);
    await page.getByLabel('New password', { exact: true }).fill(newPassword);
    await page.getByLabel('Re-enter new password').fill(newPassword);
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByRole('status')).toContainText('Password updated');

    // Signing back in with it proves the change reached the auth server.
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel('University email').pressSequentially(email);
    await page.getByLabel('Password', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // ---- Delete ------------------------------------------------------------
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Delete my account' }).click();

    const confirm = page.getByRole('button', { name: 'Delete for good' });
    await expect(confirm).toBeDisabled();

    await page.getByLabel('Type DELETE to confirm').fill('DELETE');
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page).toHaveURL(/\/$/);

    /* The auth record is gone, not merely the session — this is the assertion
       that catches a freeze trigger silently refusing the cascade. */
    const { data: after } = await db.auth.admin.listUsers({ perPage: 200 });
    expect(after.users.some((user) => user.email === email)).toBe(false);

    const { data: profile } = await db
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    expect(profile).toBeNull();
  });
});
