/**
 * File:        tests/e2e/availability.spec.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Editing the week from the Profile tab, without leaving it.
 *
 *              The assertion that matters is the last one in each test: what is
 *              in `availability_slots` afterwards. A dialog that opens, animates
 *              and closes while saving nothing would satisfy every visible
 *              expectation here, so each test reads the rows back through the
 *              admin client rather than trusting the screen.
 *
 *              The synced-slot test guards decision D7. The save deletes before
 *              it inserts, and a delete that forgot `source` would quietly eat a
 *              calendar the student had connected — with no error anywhere.
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - Initial implementation
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PASSWORD = 'availability-e2e-1234';

const RUNI_CS_DEGREE = 'de600001-0000-4000-8000-000000000001';

test.describe.configure({ mode: 'serial' });

test.describe('editing free time from the Profile tab', () => {
  test.slow();

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `availability-me-${stamp}@post.runi.ac.il`;

  let admin: SupabaseClient;
  let profileId = '';

  test.beforeAll(async () => {
    test.skip(!SERVICE_KEY, 'needs SUPABASE_SERVICE_ROLE_KEY in .env.local');

    admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(`could not create ${email}: ${error?.message}`);
    }

    profileId = data.user.id;

    await admin
      .from('profiles')
      .update({
        full_name: 'Week Student',
        degree_id: RUNI_CS_DEGREE,
        year_of_study: 2,
        city: 'Herzliya',
        is_discoverable: true,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', profileId);

    /* The Profile tab redirects into onboarding without a preferences row. */
    await admin.from('learning_preferences').upsert({
      profile_id: profileId,
      preferred_time_blocks: ['morning'],
      study_environments: ['quiet'],
      group_sizes: ['small'],
      studies_on_saturday: false,
      spoken_languages: ['he', 'en'],
      study_formats: ['in_person'],
    });
  });

  test.afterAll(async () => {
    if (SERVICE_KEY && profileId) {
      await admin.auth.admin.deleteUser(profileId);
    }
  });

  /**
   * Puts the week back to a single known slot: Sunday 08–10, hand-authored.
   *
   * These tests both rewrite the whole week, so without this the second one
   * inherits whatever the first left behind and fails for a reason that has
   * nothing to do with what it is checking.
   */
  async function resetWeek() {
    await admin.from('availability_slots').delete().eq('profile_id', profileId);
    await admin.from('availability_slots').insert({
      profile_id: profileId,
      day_of_week: 0,
      starts_at: '08:00',
      ends_at: '10:00',
      source: 'manual',
    });
  }

  test.beforeEach(async () => {
    if (SERVICE_KEY) {
      await resetWeek();
    }
  });

  async function signIn(page: Page) {
    await page.goto('/login');
    await page.getByLabel('University email').pressSequentially(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  /** The student's manual slots, as `day|start|end`, sorted for comparison. */
  async function savedManualSlots(): Promise<string[]> {
    const { data } = await admin
      .from('availability_slots')
      .select('day_of_week, starts_at, ends_at, source')
      .eq('profile_id', profileId)
      .eq('source', 'manual');

    return (data ?? [])
      .map((slot) => `${slot.day_of_week}|${slot.starts_at.slice(0, 5)}|${slot.ends_at.slice(0, 5)}`)
      .sort();
  }

  test('the button opens the grid in a dialog and saves what was tapped', async ({ page }) => {
    await signIn(page);
    await page.goto('/settings');

    await page.getByRole('button', { name: 'Edit your free time' }).click();

    const modal = page.getByRole('dialog');
    await expect(modal.getByRole('heading', { name: 'When are you free?' })).toBeVisible();

    /* The saved slot arrives already selected — the dialog reads the week, it
       does not start the student from an empty one. */
    await expect(modal.getByRole('button', { name: 'Sunday 08–10', pressed: true })).toBeVisible();
    await expect(modal.getByText('2 hours a week')).toBeVisible();

    await modal.getByRole('button', { name: 'Monday 10–12' }).click();
    await modal.getByRole('button', { name: 'Tuesday 18–20' }).click();
    await expect(modal.getByText('6 hours a week')).toBeVisible();

    /* Tapping a selected block clears it, and the save must reflect that
       rather than only ever adding. */
    await modal.getByRole('button', { name: 'Sunday 08–10' }).click();

    await modal.getByRole('button', { name: 'Save', exact: true }).click();

    /* It closes on success, and the student stays on the Profile tab. */
    await expect(modal).toBeHidden({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/settings$/);

    expect(await savedManualSlots()).toEqual(['1|10:00|12:00', '2|18:00|20:00']);
  });

  test('Cancel discards the edits, and a calendar slot survives a save', async ({ page }) => {
    /* A slot the student did not author, which this form must never touch. */
    const { error } = await admin.from('availability_slots').insert({
      profile_id: profileId,
      day_of_week: 3,
      starts_at: '16:00',
      ends_at: '18:00',
      source: 'google_calendar',
    });

    expect(error).toBeNull();

    await signIn(page);
    await page.goto('/settings');

    const modal = page.getByRole('dialog');

    await page.getByRole('button', { name: 'Edit your free time' }).click();
    await modal.getByRole('button', { name: 'Thursday 12–14' }).click();
    await modal.getByRole('button', { name: 'Cancel' }).click();
    await expect(modal).toBeHidden();

    expect(await savedManualSlots()).toEqual(['0|08:00|10:00']);

    /* Reopening starts from what is saved, not from the abandoned edit. */
    await page.getByRole('button', { name: 'Edit your free time' }).click();
    await expect(modal.getByRole('button', { name: 'Thursday 12–14', pressed: false })).toBeVisible();

    await modal.getByRole('button', { name: 'Monday 10–12' }).click();
    await modal.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(modal).toBeHidden({ timeout: 15_000 });

    expect(await savedManualSlots()).toEqual(['0|08:00|10:00', '1|10:00|12:00']);

    /* The calendar row is still there. */
    const { count } = await admin
      .from('availability_slots')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .eq('source', 'google_calendar');

    expect(count).toBe(1);
  });
});
