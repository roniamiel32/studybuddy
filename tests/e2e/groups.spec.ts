/**
 * File:        tests/e2e/groups.spec.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Phase 5 exit criteria, executed: creating a group, asking to
 *              join it, the admin's notification, and both decisions.
 *
 *              The two assertions worth the most are the ones about what the OTHER
 *              student receives. Accepting has to put a welcome line in the group
 *              chat, and rejecting has to deliver a real message to the rejected
 *              student's inbox — both are the difference between a decision and a
 *              request that silently vanished.
 * Version:     0.15.0
 *
 * Modifications:
 *     0.15.0 - 2026-08-10 - Initial implementation (Phase 5)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PASSWORD = 'groups-e2e-1234';

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
 * @returns Their profile id.
 */
async function createStudent(
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

  const enrolled = await admin.from('enrollments').insert({
    profile_id: id,
    course_offering_id: offeringId,
    university_id: RUNI_ID,
  });

  if (enrolled.error) {
    throw new Error(`could not enroll ${email}: ${enrolled.error.message}`);
  }

  return id;
}

test.describe.configure({ mode: 'serial' });

test.describe('study groups', () => {
  test.slow();

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const adminEmail = `grp-admin-${stamp}@post.runi.ac.il`;
  const joinerEmail = `grp-joiner-${stamp}@post.runi.ac.il`;
  const rejectedEmail = `grp-rejected-${stamp}@post.runi.ac.il`;

  let db: SupabaseClient;
  let offeringId = '';
  let adminId = '';
  let rejectedId = '';

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

    adminId = await createStudent(db, adminEmail, 'Group Admin', offeringId);
    await createStudent(db, joinerEmail, 'Keen Joiner', offeringId);
    rejectedId = await createStudent(db, rejectedEmail, 'Polite Applicant', offeringId);
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
    await page.goto('/login');
    await page.getByLabel('University email').pressSequentially(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  test('a student creates a study group on the course page', async ({ page }) => {
    await signIn(page, adminEmail);
    await page.goto(`/courses/${offeringId}`);

    await expect(page.getByRole('heading', { name: 'Study groups' })).toBeVisible();

    await page.getByRole('button', { name: 'Create study group' }).click();
    await page.getByLabel('Group name').fill('Thursday revision');
    await page.getByLabel('What is it for? (optional)').fill('Past exams before the midterm.');
    await page.getByLabel('How many people, including you?').fill('2');
    await page.getByRole('button', { name: 'Create group' }).click();

    const card = page
      .getByRole('list', { name: 'Study groups' })
      .getByRole('listitem')
      .filter({ hasText: 'Thursday revision' });

    await expect(card).toBeVisible({ timeout: 15_000 });
    /* The creator is a member from the moment it exists, so it reads 1 of 2. */
    await expect(card.getByText('1 of 2')).toBeVisible();
    await expect(card.getByText('Admin')).toBeVisible();
  });

  test('a classmate discovers the group and asks to join', async ({ page }) => {
    await signIn(page, joinerEmail);
    await page.goto(`/courses/${offeringId}`);

    const card = page
      .getByRole('list', { name: 'Study groups' })
      .getByRole('listitem')
      .filter({ hasText: 'Thursday revision' });

    /* Discovery: a classmate who is not in it can still see it. */
    await expect(card).toBeVisible();
    await expect(card.getByText(/Run by Group Admin/)).toBeVisible();

    await card.getByRole('button', { name: 'Request to join' }).click();

    /* The button is replaced by the specific reason it is gone. */
    await expect(card.getByText('Waiting for the admin to reply')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('the admin is notified, and accepting posts a welcome message', async ({ page }) => {
    await signIn(page, adminEmail);

    /*
     * The notification: a badge on the GROUPS tab, seeded by the server. It moved
     * there with the header redesign — a join request is a group request, and a
     * badge on Courses made a student guess which tab wanted them.
     */
    const groupsTab = page
      .getByRole('navigation', { name: 'Main' })
      .first()
      .getByRole('link', { name: /Groups/ });
    await expect(groupsTab).toContainText('1 join request');

    await page.goto(`/courses/${offeringId}`);
    const card = page
      .getByRole('list', { name: 'Study groups' })
      .getByRole('listitem')
      .filter({ hasText: 'Thursday revision' });

    await expect(card.getByText('1 request waiting')).toBeVisible();
    await card.getByRole('link', { name: /Open and review/ }).click();

    await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}$/);

    /*
     * Review opens the applicant's profile, with the decision on it.
     *
     * Asserted with toContainText rather than a text locator: the dialog is
     * rendered inside the row (closed, but in the DOM), so the applicant's name
     * legitimately appears twice and a text match is ambiguous.
     */
    const row = page.getByRole('list', { name: 'Pending requests' }).getByRole('listitem');
    await expect(row).toContainText('Keen Joiner');
    await row.getByRole('button', { name: 'Review' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Join request' })).toBeVisible();
    await expect(dialog).toContainText('Keen Joiner');
    await expect(dialog.getByText(/1 place left/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Accept' }).click();

    /* The system message, in the group chat, without a reload. */
    await expect(page.getByText('Welcome Keen Joiner to the group!')).toBeVisible({
      timeout: 15_000,
    });

    /* They are a member now, and the group is full at 2 of 2. */
    await expect(page.getByRole('list', { name: 'Members' })).toContainText('Keen Joiner');
    await expect(page.getByText('2 of 2')).toBeVisible();

    /* And the badge has cleared. */
    await expect(groupsTab).toHaveText('Groups');
  });

  test('rejecting sends the applicant a real message', async ({ page }) => {
    /* A second applicant, asking after the group is already full. */
    const asApplicant = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await asApplicant.auth.signInWithPassword({
      email: rejectedEmail,
      password: PASSWORD,
    });
    expect(signedIn.error).toBeNull();

    const { data: group } = await db
      .from('study_groups')
      .select('id')
      .eq('name', 'Thursday revision')
      .single();

    const asked = await asApplicant
      .from('group_requests')
      .insert({ group_id: group!.id, requester_id: rejectedId, status: 'pending' })
      .select('id')
      .single();
    expect(asked.error).toBeNull();

    await signIn(page, adminEmail);
    await page.goto(`/groups/${group!.id}`);

    const row = page
      .getByRole('list', { name: 'Pending requests' })
      .getByRole('listitem')
      .filter({ hasText: 'Polite Applicant' });

    await row.getByRole('button', { name: 'Review' }).click();

    const dialog = page.getByRole('dialog');
    /* Full, and said before they press Accept rather than after it fails. */
    await expect(dialog.getByText(/group is full/i)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Accept' })).toBeDisabled();

    await dialog.getByRole('button', { name: 'Reject' }).click();

    /* The canned reasons, and the text shown in full before it is sent. */
    await dialog.getByLabel('Reason').selectOption('group_full');
    await expect(dialog.getByText(/They will receive:/)).toBeVisible();
    await expect(dialog.getByText(/The group is full at the moment/)).toBeVisible();

    await dialog.getByRole('button', { name: 'Send and reject' }).click();

    /*
     * The request is gone from the REQUESTS list — scoped there deliberately.
     *
     * Their name legitimately reappears elsewhere on this page since Phase 7B:
     * rejecting does not leave a live request, so they become someone the admin
     * could invite. That is the point of rejecting being reversible by asking,
     * and a page-wide "their name is nowhere" assertion would now fail on a
     * feature working correctly.
     */
    await expect(
      page.getByRole('list', { name: 'Pending requests' }).getByText('Polite Applicant'),
    ).toHaveCount(0, { timeout: 15_000 });

    /*
     * THE ASSERTION THAT MATTERS: the rejected student has a message about it, in
     * the place they already read messages. A rejection they are never told about
     * is the failure this whole flow exists to prevent.
     */
    const { data: messages } = await asApplicant
      .from('messages')
      .select('body, sender_id')
      .order('created_at', { ascending: false });

    expect(messages?.length ?? 0).toBeGreaterThan(0);
    expect(messages![0].body).toMatch(/The group is full at the moment/);
    expect(messages![0].sender_id).toBe(adminId);

    /* And it is on the row too, so the group's history says what was said. */
    const { data: decided } = await db
      .from('group_requests')
      .select('status, decision_note')
      .eq('id', asked.data!.id)
      .single();

    expect(decided!.status).toBe('rejected');
    expect(decided!.decision_note).toMatch(/full/i);
  });

  test('a custom rejection sends the admin’s own words', async ({ page }) => {
    /* Ask again — allowed after a rejection, deliberately. */
    const asApplicant = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await asApplicant.auth.signInWithPassword({ email: rejectedEmail, password: PASSWORD });

    const { data: group } = await db
      .from('study_groups')
      .select('id')
      .eq('name', 'Thursday revision')
      .single();

    const asked = await asApplicant
      .from('group_requests')
      .insert({ group_id: group!.id, requester_id: rejectedId, status: 'pending' })
      .select('id')
      .single();
    expect(asked.error).toBeNull();

    await signIn(page, adminEmail);
    await page.goto(`/groups/${group!.id}`);

    await page
      .getByRole('list', { name: 'Pending requests' })
      .getByRole('listitem')
      .filter({ hasText: 'Polite Applicant' })
      .getByRole('button', { name: 'Review' })
      .click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Reject' }).click();
    await dialog.getByLabel('Reason').selectOption('other');

    /* Nothing written yet, so there is nothing to send. */
    await expect(dialog.getByRole('button', { name: 'Send and reject' })).toBeDisabled();

    await dialog
      .getByLabel('Your message')
      .fill('Sorry! We have settled on just the two of us for this one.');
    await dialog.getByRole('button', { name: 'Send and reject' }).click();

    /* Scoped to the requests list, as above: a rejected applicant is someone the
       admin could now invite, so their name reappears in the invite panel. */
    await expect(
      page.getByRole('list', { name: 'Pending requests' }).getByText('Polite Applicant'),
    ).toHaveCount(0, { timeout: 15_000 });

    const { data: messages } = await asApplicant
      .from('messages')
      .select('body')
      .order('created_at', { ascending: false });

    expect(messages![0].body).toBe('Sorry! We have settled on just the two of us for this one.');
  });

  test('a group the student is not in is a 404', async ({ page }) => {
    const { data: group } = await db
      .from('study_groups')
      .select('id')
      .eq('name', 'Thursday revision')
      .single();

    await signIn(page, rejectedEmail);

    /*
     * They can see the group exists on the course page — discovery — but the group
     * page is mostly chat, and the chat is members-only.
     */
    const response = await page.goto(`/groups/${group!.id}`);

    expect(response?.status()).toBe(404);
  });
});
