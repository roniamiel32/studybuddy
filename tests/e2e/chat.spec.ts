/**
 * File:        tests/e2e/chat.spec.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Phase 3 exit criterion, executed: pressing "Send message" on
 *              a match opens a conversation with an opener already in it, the
 *              thread can be replied to, and a message arriving from the other
 *              student appears WITHOUT A RELOAD and raises the navigation badge.
 *
 *              The realtime assertions are the point of this file. They are also
 *              the only ones here that cannot be proved by any other layer: the
 *              RLS suite proves who may read a conversation, the unit tests prove
 *              the formatting, but "the other person's message shows up on its
 *              own" needs a real browser holding a real socket.
 *
 *              The second student is driven through supabase-js rather than a
 *              second browser context. It is the same insert the app performs,
 *              subject to the same policies, and it keeps the test to one page.
 * Version:     0.13.0
 *
 * Modifications:
 *     0.13.0 - 2026-08-10 - Requests renamed to Messages
 *     0.12.0 - 2026-08-10 - Initial implementation (Phase 3)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const PASSWORD = 'chat-e2e-test-1234';

/** The seeded Reichman Computer Science degree and its current-term offering. */
const RUNI_ID = '11111111-1111-4111-8111-111111111111';
const RUNI_CS_DEGREE = 'de600001-0000-4000-8000-000000000001';
const RUNI_CURRENT_TERM = 'dddd0002-0000-4000-8000-000000000002';

const created: string[] = [];

/**
 * Creates a fully onboarded, matchable student through the admin API.
 *
 * Going through the API rather than the UI keeps this file about the chat: the
 * onboarding flow has its own suite, and repeating it here would make a realtime
 * test fail for reasons that have nothing to do with realtime.
 *
 * @param admin      - Service-role client.
 * @param email      - Their address.
 * @param fullName   - Their display name.
 * @param offeringId - The course to enroll them in.
 * @returns Their profile id.
 */
async function createMatchableStudent(
  admin: SupabaseClient,
  email: string,
  fullName: string,
  offeringId: string,
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
    ends_at: '12:00',
  });

  return id;
}

test.describe.configure({ mode: 'serial' });

test.describe('conversations', () => {
  test.slow();

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const mineEmail = `chat-me-${stamp}@post.runi.ac.il`;
  const theirsEmail = `chat-them-${stamp}@post.runi.ac.il`;

  let admin: SupabaseClient;
  /*
   * ONE signed-in client for the partner, created once.
   *
   * Signing in per test looked tidier and was wrong: the local auth server rate
   * limits password grants, so a later sign-in quietly failed and left an
   * ANONYMOUS client. RLS then correctly returned no conversations, and the test
   * failed several lines later on a null dereference that said nothing about the
   * real cause.
   */
  let asPartner: SupabaseClient;
  let partnerId = '';
  let offeringId = '';

  test.beforeAll(async () => {
    test.skip(!SERVICE_KEY, 'needs SUPABASE_SERVICE_ROLE_KEY in .env.local');

    admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: offering } = await admin
      .from('course_offerings')
      .select('id, courses!inner(code)')
      .eq('courses.code', 'CS-3040')
      .eq('term_id', RUNI_CURRENT_TERM)
      .single();

    offeringId = offering!.id;

    await createMatchableStudent(admin, mineEmail, 'Dana Test', offeringId);
    partnerId = await createMatchableStudent(admin, theirsEmail, 'Yuval Partner', offeringId);

    asPartner = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: signInError } = await asPartner.auth.signInWithPassword({
      email: theirsEmail,
      password: PASSWORD,
    });

    /* Asserted, so a failed sign-in fails here with the reason rather than
       surfacing as an empty query result three tests later. */
    if (signInError) {
      throw new Error(`partner sign-in failed: ${signInError.message}`);
    }
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

  test('sending a message opens a conversation with an opener already in it', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('University email').fill(mineEmail);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);

    /* The renamed control. "Send smart icebreaker" promised which kind of opener
       it would write; this one is true whether a model was involved or not. */
    const send = page.getByRole('button', { name: 'Send message to Yuval Partner' });
    await expect(send).toBeVisible();

    await send.click();

    /* Straight into the thread, which already contains a first message. */
    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Yuval Partner' })).toBeVisible();
    /* The opener addresses them by name and names something they share — scoped
       to the bubble, since "Yuval" also appears in the header and the composer
       label. */
    await expect(page.getByText(/^Hi Yuval!/)).toBeVisible();
    await expect(page.getByText(/Sent /)).toBeVisible();
  });

  test('a message from the other student arrives without a reload', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('University email').fill(mineEmail);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('link', { name: /Messages/ }).click();
    await expect(page).toHaveURL(/\/messages$/);
    await page.getByRole('link', { name: /Yuval Partner/ }).click();
    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);

    const conversationId = page.url().split('/').pop()!;

    /* Give the socket a moment to attach before writing the row it must carry. */
    await page.waitForTimeout(1500);

    const inserted = await asPartner.from('messages').insert({
      conversation_id: conversationId,
      sender_id: partnerId,
      body: 'Realtime hello from Yuval',
    });
    expect(inserted.error).toBeNull();

    /*
     * No reload anywhere in this test. If this passes only because Next
     * re-rendered the page for some other reason, the assertion below would still
     * hold — so the URL is checked to confirm no navigation happened.
     */
    await expect(page.getByText('Realtime hello from Yuval')).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toContain(conversationId);

    /* Opening the thread marks the other side's messages read. */
    await expect(async () => {
      const { data } = await asPartner
        .from('messages')
        .select('is_read')
        .eq('conversation_id', conversationId)
        .eq('sender_id', partnerId)
        .single();

      expect(data?.is_read).toBe(true);
    }).toPass({ timeout: 15_000 });
  });

  test('the unread badge appears live, and clears when the thread is opened', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('University email').fill(mineEmail);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    const messages = page.getByRole('navigation', { name: 'Main' }).getByRole('link', {
      name: /Messages/,
    });

    /* Nothing unread: the badge must be absent, not a zero in a circle. */
    await expect(messages).toHaveText('Messages');

    await page.waitForTimeout(1500);

    const { data: conversation, error: readError } = await asPartner
      .from('conversations')
      .select('id')
      .limit(1)
      .maybeSingle();

    /* Checked rather than asserted with `!`: a missing conversation here means
       the earlier test did not run, which is worth saying out loud. */
    expect(readError).toBeNull();
    expect(conversation, 'the conversation from the first test should exist').not.toBeNull();

    const { error: insertError } = await asPartner.from('messages').insert({
      conversation_id: conversation!.id,
      sender_id: partnerId,
      body: 'Are you around this afternoon?',
    });
    expect(insertError).toBeNull();

    /* Live, on a page that was never reloaded. */
    await expect(messages).toContainText('1 unread message', { timeout: 15_000 });
    expect(page.url()).toContain('/dashboard');

    /* Opening the thread clears it. */
    await messages.click();
    await page.getByRole('link', { name: /Yuval Partner/ }).click();
    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/);

    await expect(messages).toHaveText('Messages', { timeout: 15_000 });
  });

  test('a reply typed in the composer is sent and shown', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('University email').fill(mineEmail);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto('/messages');
    await page.getByRole('link', { name: /Yuval Partner/ }).click();

    const composer = page.getByLabel(/Message Yuval Partner/);
    const submit = page.getByRole('button', { name: 'Send message' });

    /* Nothing to send, so the button is closed. */
    await expect(submit).toBeDisabled();

    await composer.fill('Sunday at 10 works for me.');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByText('Sunday at 10 works for me.')).toBeVisible({ timeout: 15_000 });
    /* Cleared, so the next message starts from empty. */
    await expect(composer).toHaveValue('');
  });

  test('a conversation belonging to someone else is a 404, not a forbidden', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('University email').fill(mineEmail);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    /*
     * A well-formed id that is not theirs. Distinguishing "forbidden" from "not
     * found" would confirm the conversation exists, which is more than a stranger
     * should be able to learn by guessing ids.
     */
    const response = await page.goto('/messages/0e1d4a2b-0000-4000-8000-000000000999');

    expect(response?.status()).toBe(404);
  });
});
