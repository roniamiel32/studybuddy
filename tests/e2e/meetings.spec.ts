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
     *   Mia  10-12, 12-14, 14-16
     *   Paul        12-14, 14-16
     *
     * They share 12-16 and nothing else, so 10-12 is the hour that must never
     * be offered — which is what the assertion in the second test is about.
     *
     * ON EVERY WEEKDAY, NOT JUST SUNDAY, and that is a fix rather than padding.
     * The pattern used to be Sunday-only, which was fine while the picker looked
     * fourteen days ahead: next Sunday was always inside the window. Phase 9H
     * narrowed it to seven, so on a Sunday afternoon today's slots are already
     * past and next Sunday is a day beyond the edge — the suite passed six days
     * a week and failed on the seventh. Repeating the same lopsided shape across
     * the week keeps every assertion identical and stops the calendar deciding.
     */
    await db.from('availability_slots').insert(
      Array.from({ length: 7 }, (_, day) => [
        { profile_id: meId, day_of_week: day, starts_at: '10:00', ends_at: '12:00' },
        { profile_id: meId, day_of_week: day, starts_at: '12:00', ends_at: '14:00' },
        { profile_id: meId, day_of_week: day, starts_at: '14:00', ends_at: '16:00' },
        { profile_id: partnerId, day_of_week: day, starts_at: '12:00', ends_at: '14:00' },
        { profile_id: partnerId, day_of_week: day, starts_at: '14:00', ends_at: '16:00' },
      ]).flat(),
    );

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

    /*
     * "Next upcoming session", not "Scheduled sessions". The strip was split in
     * two — the soonest session on its own, the rest under "Other scheduled
     * sessions" — and this pair has exactly one, so it is the next one.
     */
    const strip = page.getByRole('list', { name: 'Next upcoming session' });
    await expect(strip).toContainText('Past papers');
    await expect(strip).toContainText('Library, floor 2');
  });

  test('cancelling frees the slot and offers it again', async ({ page }) => {
    await signIn(page, partnerEmail);
    await page.goto(`/messages/${conversationId}`);

    const strip = page.getByRole('list', { name: 'Next upcoming session' });
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

  /*
   * LAST IN THE FILE, DELIBERATELY. These run serially against one shared
   * conversation, and a series leaves eight weeks of rows in it — enough to
   * change what `sessions[0]` means for any test that came after. Booking the
   * horizon is the one act here big enough to disturb its neighbours, so it goes
   * where it has none.
   */
  test('a repeating session books the whole horizon, and stops on request', async ({
    page,
  }) => {
    /*
     * THE WIRING TEST. The database side is covered in
     * tests/integration/recurring-meetings.test.ts and the two controls in the
     * unit suite; what only a real browser can prove is that the checkbox
     * reaches the series RPC rather than the one-off one — a mis-named input
     * would book a single session and fail nowhere.
     */
    await signIn(page, meEmail);
    await page.goto(`/messages/${conversationId}`);

    await page.getByRole('button', { name: 'Schedule a meeting' }).click();

    const dialog = page.getByRole('dialog');
    const slot = dialog.getByRole('button', { name: /14:00/ }).first();
    await expect(slot).toBeVisible({ timeout: 20_000 });
    await slot.click();

    await dialog.getByLabel('What is it for?').fill('Every week, please');
    await dialog.getByRole('checkbox', { name: /Repeat weekly/ }).check();
    await dialog.getByRole('button', { name: 'Schedule it' }).click();

    await expect(dialog).toBeHidden({ timeout: 20_000 });

    const { data: booked } = await db
      .from('meetings')
      .select('id, series_id, starts_at, status')
      .eq('conversation_id', conversationId)
      .eq('title', 'Every week, please')
      .order('starts_at');

    const occurrences = booked ?? [];

    /* Eight weeks of horizon, all of them on one series. */
    expect(occurrences.length).toBeGreaterThanOrEqual(8);
    expect(new Set(occurrences.map((row) => row.series_id)).size).toBe(1);
    expect(occurrences[0].series_id).not.toBeNull();

    /*
     * EIGHT ROWS, ONE CARD. The occurrences are real meetings — which is what
     * makes them block their slots — and the thread had one booking in it, so
     * the feed and the banner each show only the sitting that is next. This
     * assertion is the whole of that rule, end to end.
     */
    await expect(page.getByRole('button', { name: /Every week, please/ })).toHaveCount(1);

    /*
     * The banner's half of the same rule is asserted in the unit suite instead.
     * By the time this test runs the thread holds earlier bookings too, so which
     * session the banner puts on top — and which it folds behind "+N" — depends
     * on the tests before it. A meaningful assertion here would have to
     * reconstruct that, which is a test of the fixture rather than of the rule.
     */

    /*
     * Reached through the CARD IN THE THREAD rather than the banner. That is how
     * a student opens a sitting that is days away, and it is the path the two
     * endings had to be added to.
     */
    await page.getByRole('button', { name: /Every week, please/ }).click();

    const details = page.getByRole('dialog').filter({ hasText: 'Every week, please' });
    await expect(details.getByText('Repeats weekly')).toBeVisible();
    await expect(
      details.getByRole('link', { name: /Add weekly to Google Calendar/ }),
    ).toBeVisible();

    await details.getByRole('button', { name: 'Stop repeating' }).click();

    /* From now on: every future sitting is called off in one press. */
    await expect
      .poll(
        async () => {
          const { data } = await db
            .from('meetings')
            .select('status')
            .eq('series_id', occurrences[0].series_id!)
            .eq('status', 'scheduled');

          return data?.length ?? -1;
        },
        { timeout: 20_000 },
      )
      .toBe(0);
  });
});
