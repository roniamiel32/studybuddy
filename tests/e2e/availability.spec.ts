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
 *              THE SYNCED-SLOT TEST CHANGED SIDES, and it is worth knowing why.
 *              It used to assert that a calendar row SURVIVED a hand-edit of the
 *              week — written when the only risk in sight was a delete that
 *              forgot `source` and quietly ate a connected calendar. The two-way
 *              sync made that assertion wrong. Manual rows and synced rows must
 *              never coexist: the matching engine unions a profile's slots and
 *              measures overlap in minutes, so a manual "Monday 10–12" beside a
 *              synced "Monday 09:00–11:30" double-counts the shared 90 minutes
 *              and inflates every score that student appears in. Saving the grid
 *              by hand is therefore an explicit claim on the week, and
 *              standDownCalendarSync hands it over: the synced rows go, the sync
 *              switches off, and the student is told it paused rather than left
 *              to notice.
 *
 *              So the test now asserts the stand-down, in all three of its parts.
 * Version:     0.49.0
 *
 * Modifications:
 *     0.49.0 - 2026-08-19 - Saving by hand pauses the sync; the spec had it the
 *                           other way round, from before the sync existed
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
      await admin.from('calendar_connections').delete().eq('profile_id', profileId);
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

  test('Cancel discards the edits, and a save stands the calendar sync down', async ({
    page,
  }) => {
    /*
     * A connected student with a synced week: a connection row, the sync on, and
     * one slot the student did not author. All three are what the stand-down has
     * to act on, and seeding only the slot would let two thirds of it regress
     * unnoticed.
     */
    const { error: connectionError } = await admin.from('calendar_connections').upsert(
      {
        profile_id: profileId,
        provider: 'google',
        access_token: 'availability-e2e-access',
        refresh_token: 'availability-e2e-refresh',
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        scope: 'https://www.googleapis.com/auth/calendar.readonly',
        calendar_timezone: 'Asia/Jerusalem',
        google_email: 'week-student@example.com',
      },
      { onConflict: 'profile_id' },
    );

    expect(connectionError).toBeNull();

    await admin
      .from('profile_private')
      .upsert(
        { profile_id: profileId, google_calendar_sync_enabled: true },
        { onConflict: 'profile_id' },
      );

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

    /*
     * THE STAND-DOWN, IN ITS THREE PARTS. Any one of them alone would leave the
     * student worse off than before: the rows without the switch means the next
     * sync silently puts them back; the switch without the message means a week
     * that stopped updating with no explanation anywhere.
     */
    const { count } = await admin
      .from('availability_slots')
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .eq('source', 'google_calendar');

    expect(count).toBe(0);

    const { data: privateRow } = await admin
      .from('profile_private')
      .select('google_calendar_sync_enabled')
      .eq('profile_id', profileId)
      .maybeSingle();

    expect(privateRow?.google_calendar_sync_enabled).toBe(false);

    const { data: connection } = await admin
      .from('calendar_connections')
      .select('last_sync_error')
      .eq('profile_id', profileId)
      .maybeSingle();

    /* The student is told, and told what to do about it. */
    expect(connection?.last_sync_error).toContain('Paused');
    expect(connection?.last_sync_error).toContain('Resync');
  });
});
