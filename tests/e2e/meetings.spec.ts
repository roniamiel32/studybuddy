/**
 * File:        tests/e2e/meetings.spec.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Scheduling a session from a chat, end to end.
 *
 *              THE ASSERTION THAT MATTERS is the one against
 *              `meeting_attendees`: a dialog that opens, lists plausible times
 *              and closes politely would satisfy every visible expectation here
 *              while booking nothing.
 *
 *              The second one is the offered times themselves. The two students
 *              are given deliberately lopsided weeks, so an hour only one of them
 *              is free for must not appear — the failure a union dressed up as an
 *              intersection produces, and one that looks entirely reasonable
 *              on screen.
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PASSWORD = 'meetings-e2e-1234';

const RUNI_ID = '11111111-1111-4111-8111-111111111111';
const RUNI_CS_DEGREE = 'de600001-0000-4000-8000-000000000001';
const RUNI_CURRENT_TERM = 'dddd0002-0000-4000-8000-000000000002';

/** 0 = Sunday, the numbering the schema uses. */
const SUNDAY = 0;

test.describe.configure({ mode: 'serial' });

test.describe('scheduling a session from a chat', () => {
  test.slow();

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const meEmail = `mtg-me-${stamp}@post.runi.ac.il`;
  const partnerEmail = `mtg-partner-${stamp}@post.runi.ac.il`;

  let db: SupabaseClient;
  let meId = '';
  let partnerId = '';
  let conversationId = '';

  /**
   * Creates an onboarded student enrolled in one course.
   *
   * @param email    - Their address.
   * @param fullName - Their display name.
   * @param offering - The course to enrol them in.
   * @returns Their profile id.
   */
  async function createStudent(email: string, fullName: string, offering: string) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(`could not create ${email}: ${error?.message}`);
    }

    const id = data.user.id;

    await db
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

    await db.from('learning_preferences').upsert({
      profile_id: id,
      preferred_time_blocks: ['morning'],
      study_environments: ['quiet'],
      group_sizes: ['small'],
      studies_on_saturday: false,
      spoken_languages: ['he', 'en'],
      study_formats: ['in_person', 'remote'],
    });

    await db.from('enrollments').insert({
      profile_id: id,
      course_offering_id: offering,
      university_id: RUNI_ID,
    });

    return id;
  }

  test.beforeAll(async () => {
    test.skip(!SERVICE_KEY, 'needs SUPABASE_SERVICE_ROLE_KEY in .env.local');

    db = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: offering } = await db
      .from('course_offerings')
      .select('id, courses!inner(code)')
      .eq('term_id', RUNI_CURRENT_TERM)
      .eq('courses.code', 'CS-3040')
      .single();

    meId = await createStudent(meEmail, 'Mia Meeting', offering!.id);
    partnerId = await createStudent(partnerEmail, 'Paul Partner', offering!.id);

    /*
     * Lopsided weeks, on purpose.
     *
     *   Mia  Sunday 10-12, 12-14, 14-16
     *   Paul Sunday        12-14, 14-16
     *
     * They share 12-16 and nothing else, so 10-12 is the hour that must never
     * be offered.
     */
    await db.from('availability_slots').insert([
      { profile_id: meId, day_of_week: SUNDAY, starts_at: '10:00', ends_at: '12:00' },
      { profile_id: meId, day_of_week: SUNDAY, starts_at: '12:00', ends_at: '14:00' },
      { profile_id: meId, day_of_week: SUNDAY, starts_at: '14:00', ends_at: '16:00' },
      { profile_id: partnerId, day_of_week: SUNDAY, starts_at: '12:00', ends_at: '14:00' },
      { profile_id: partnerId, day_of_week: SUNDAY, starts_at: '14:00', ends_at: '16:00' },
    ]);

    const { data: conversation, error } = await db
      .from('conversations')
      .insert({
        participant_a: meId,
        participant_b: partnerId,
        university_id: RUNI_ID,
        course_offering_id: offering!.id,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`conversation seed failed: ${error.message}`);
    }

    conversationId = conversation.id;
  });

  test.afterAll(async () => {
    if (SERVICE_KEY) {
      await db.auth.admin.deleteUser(meId);
      await db.auth.admin.deleteUser(partnerId);
    }
  });

  async function signIn(page: Page, email: string) {
    await page.goto('/login');
    await page.getByLabel('University email').pressSequentially(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  /** The sessions actually stored for this pair. */
  async function bookedSessions() {
    const { data } = await db
      .from('meetings')
      .select('id, title, location, starts_at, status, meeting_attendees ( profile_id, rsvp )')
      .eq('conversation_id', conversationId);

    return data ?? [];
  }

  test('the composer offers scheduling next to Send', async ({ page }) => {
    await signIn(page, meEmail);
    await page.goto(`/messages/${conversationId}`);

    /* Both controls, side by side, in the composer. */
    await expect(page.getByRole('button', { name: 'Send message' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Schedule a meeting' })).toBeVisible();
  });

  test('the picker offers only hours both are free, and books one', async ({ page }) => {
    await signIn(page, meEmail);
    await page.goto(`/messages/${conversationId}`);

    await page.getByRole('button', { name: 'Schedule a meeting' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Schedule a session' })).toBeVisible();

    /* The shared hours, and only those. */
    const shared = dialog.getByRole('button', { name: /12:00/ }).first();
    await expect(shared).toBeVisible({ timeout: 20_000 });

    /*
     * THE ASSERTION THIS SPEC EXISTS FOR. Mia is free 10-12 and Paul is not, so
     * a picker showing 10:00 is offering a time only one of them can make.
     */
    await expect(dialog.getByRole('button', { name: /^10:00/ })).toHaveCount(0);

    await shared.click();

    await dialog.getByLabel('What is it for?').fill('Past papers');
    await dialog.getByLabel('Where? (optional)').fill('Library, floor 2');
    await dialog.getByRole('button', { name: 'Schedule it' }).click();

    /* It closes on success, and the student stays in the thread. */
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    /* It really booked, for BOTH of them. */
    const sessions = await bookedSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].title).toBe('Past papers');
    expect(sessions[0].location).toBe('Library, floor 2');

    const attendees = sessions[0].meeting_attendees as { profile_id: string; rsvp: string }[];
    expect(attendees).toHaveLength(2);
    expect(attendees.every((row) => row.rsvp === 'going')).toBe(true);
  });

  test('the booked session shows in the thread, for the other person too', async ({ page }) => {
    await signIn(page, partnerEmail);
    await page.goto(`/messages/${conversationId}`);

    const strip = page.getByRole('list', { name: 'Scheduled sessions' });
    await expect(strip).toContainText('Past papers');
    await expect(strip).toContainText('Library, floor 2');
  });

  test('cancelling frees the slot and offers it again', async ({ page }) => {
    await signIn(page, partnerEmail);
    await page.goto(`/messages/${conversationId}`);

    const strip = page.getByRole('list', { name: 'Scheduled sessions' });
    await strip.getByRole('button', { name: 'Cannot make it' }).click();

    await expect(strip.getByText('You are not going to this one.')).toBeVisible({
      timeout: 20_000,
    });

    /* The database agrees, which is what frees the slot everywhere. */
    const sessions = await bookedSessions();
    const attendees = sessions[0].meeting_attendees as { profile_id: string; rsvp: string }[];
    const theirs = attendees.find((row) => row.profile_id === partnerId);

    expect(theirs?.rsvp).toBe('cancelled');

    /*
     * And the picker still offers the hours that really are shared.
     *
     * THIS WATCHES 14:00 RATHER THAN 12:00 SINCE PHASE 9H, and the change is not
     * a weakening. The picker used to look fourteen days ahead, so asserting on
     * 12:00 was really watching the *following* Sunday's copy of it appear —
     * never quite the claim the test was making. Inside the one-week window
     * there is a single Sunday, and its 12:00 is correctly still withheld: Mia
     * has not cancelled, and a shared slot needs both of them. One person
     * stepping out frees their own diary, which the assertion above already
     * proves against the table the scheduler derives "busy" from.
     */
    await page.getByRole('button', { name: 'Schedule a meeting' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: /14:00/ }).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
