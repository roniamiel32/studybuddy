/**
 * File:        tests/e2e/group-admin.spec.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Running a study group: editing it, promoting, and inviting.
 *
 *              THE INVITATION TEST IS THE ONE THAT MATTERS. Phase 5 refused to
 *              let an admin put a classmate into a group without their say-so,
 *              and Phase 7B kept that promise by inverting the request rather
 *              than dropping it. So this checks the thing a "add member" feature
 *              would quietly have broken: that the invited student is NOT in the
 *              group until they themselves say yes.
 *
 *              The rank tests check the screen agrees with the database. The
 *              triggers refuse an illegal demotion whatever the UI does, but a
 *              button that appears and then fails is its own kind of broken.
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7A/7B)
 */

/*
 * The waits after a submit are generous for the reason playwright.config.ts
 * already gives: this suite runs against the DEV server, which compiles a route —
 * and a server action — the first time it is asked for. A measured first save
 * here took 35 seconds of Turbopack and 7 milliseconds of database. The number
 * below is compile budget, not an admission that saving is slow.
 */
const COMPILE_BUDGET = 45_000;

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PASSWORD = 'group-admin-e2e-1234';

const RUNI_ID = '11111111-1111-4111-8111-111111111111';
const RUNI_CS_DEGREE = 'de600001-0000-4000-8000-000000000001';
const RUNI_CURRENT_TERM = 'dddd0002-0000-4000-8000-000000000002';

test.describe.configure({ mode: 'serial' });

test.describe('running a study group', () => {
  test.slow();

  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const founderEmail = `gadm-founder-${stamp}@post.runi.ac.il`;
  const memberEmail = `gadm-member-${stamp}@post.runi.ac.il`;
  const outsiderEmail = `gadm-outsider-${stamp}@post.runi.ac.il`;

  let db: SupabaseClient;
  let founderId = '';
  let memberId = '';
  let outsiderId = '';
  let groupId = '';

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
      study_formats: ['in_person'],
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

    founderId = await createStudent(founderEmail, 'Fiona Founder', offering!.id);
    memberId = await createStudent(memberEmail, 'Mo Member', offering!.id);
    outsiderId = await createStudent(outsiderEmail, 'Omar Outsider', offering!.id);

    const { data: group, error } = await db
      .from('study_groups')
      .insert({
        course_offering_id: offering!.id,
        university_id: RUNI_ID,
        admin_id: founderId,
        name: 'Algorithms crew',
        max_participants: 4,
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`group seed failed: ${error.message}`);
    }

    groupId = group.id;

    /* One plain member, added the way the product adds people. */
    const { data: request } = await db
      .from('group_requests')
      .insert({ group_id: groupId, requester_id: memberId, status: 'pending' })
      .select('id')
      .single();

    await db
      .from('group_requests')
      .update({ status: 'approved', decided_at: new Date().toISOString() })
      .eq('id', request!.id);

    await db.from('study_group_members').insert({ group_id: groupId, profile_id: memberId });
  });

  test.afterAll(async () => {
    if (SERVICE_KEY) {
      for (const id of [founderId, memberId, outsiderId]) {
        await db.auth.admin.deleteUser(id);
      }
    }
  });

  async function signIn(page: Page, email: string) {
    await page.goto('/login');
    await page.getByLabel('University email').pressSequentially(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  /** The roles actually stored, by profile id. */
  async function storedRoles(): Promise<Record<string, string>> {
    const { data } = await db
      .from('study_group_members')
      .select('profile_id, role')
      .eq('group_id', groupId);

    return Object.fromEntries((data ?? []).map((row) => [row.profile_id, row.role]));
  }

  test('an admin can rename the group and change its size', async ({ page }) => {
    await signIn(page, founderEmail);
    await page.goto(`/groups/${groupId}`);

    await page.getByRole('button', { name: 'Settings' }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Group name').fill('Algorithms crew, renamed');
    await dialog.getByLabel('How many people, including you?').fill('6');
    await dialog.getByRole('button', { name: 'Save changes' }).click();

    await expect(dialog).toBeHidden({ timeout: COMPILE_BUDGET });

    const { data } = await db
      .from('study_groups')
      .select('name, max_participants')
      .eq('id', groupId)
      .single();

    expect(data?.name).toBe('Algorithms crew, renamed');
    expect(data?.max_participants).toBe(6);
  });

  test('the size cannot be cut below the people already in it', async ({ page }) => {
    await signIn(page, founderEmail);
    await page.goto(`/groups/${groupId}`);

    await page.getByRole('button', { name: 'Settings' }).click();

    const dialog = page.getByRole('dialog');
    /* Two members. The input's own min would stop this, so it is set through
       the DOM to prove the server refuses it too. */
    await dialog.getByLabel('How many people, including you?').evaluate((input) => {
      (input as HTMLInputElement).value = '1';
    });
    await dialog.getByLabel('Group name').click();
    await dialog.getByRole('button', { name: 'Save changes' }).click();

    /* Refused, and the dialog stays open with the reason on it. */
    await expect(dialog).toBeVisible();

    const { data } = await db
      .from('study_groups')
      .select('max_participants')
      .eq('id', groupId)
      .single();

    expect(data?.max_participants).toBe(6);
  });

  test('an admin can promote a member', async ({ page }) => {
    await signIn(page, founderEmail);
    await page.goto(`/groups/${groupId}`);

    await page.getByRole('button', { name: 'Make admin' }).click();

    /*
     * Waits on a control that only exists AFTER the promotion: "Remove admin" is
     * offered to the founder for an admin, and to nobody else. Waiting on the
     * word "Admin" instead would pass instantly against the "Make admin" button
     * still on screen, and the database check below would then run before the
     * action had finished.
     */
    await expect(page.getByRole('button', { name: 'Remove admin' })).toBeVisible({
      timeout: COMPILE_BUDGET,
    });

    expect((await storedRoles())[memberId]).toBe('admin');
  });

  test('the new admin is offered nothing against the founder', async ({ page }) => {
    /*
     * THE RANK RULE ON SCREEN. The triggers refuse both of these whatever the UI
     * does, but a button that appears and then errors is its own kind of broken.
     *
     * Its own test rather than a third act of the promotion one: three sign-ins
     * and a promotion do not fit in a single test's budget, and the failure that
     * produced was a timeout in the middle of setup rather than anything about
     * ranks.
     */
    await signIn(page, memberEmail);
    await page.goto(`/groups/${groupId}`);

    /* exact, because the fixture is called "Fiona Founder" and the rank chip is
       called "Founder" — without it this matches the name as well as the chip. */
    await expect(page.getByText('Founder', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove admin' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Remove Fiona Founder/ })).toHaveCount(0);
  });

  test('only the founder can undo a promotion', async ({ page }) => {
    await signIn(page, founderEmail);
    await page.goto(`/groups/${groupId}`);

    await page.getByRole('button', { name: 'Remove admin' }).click();

    await expect(page.getByRole('button', { name: 'Make admin' })).toBeVisible({
      timeout: COMPILE_BUDGET,
    });

    expect((await storedRoles())[memberId]).toBe('member');
  });

  test('inviting asks rather than adds', async ({ page }) => {
    await signIn(page, founderEmail);
    await page.goto(`/groups/${groupId}`);

    const panel = page.getByRole('list', { name: 'Classmates you can invite' });
    await expect(panel).toContainText('Omar Outsider');

    await panel
      .getByRole('listitem')
      .filter({ hasText: 'Omar Outsider' })
      .getByRole('button', { name: 'Invite' })
      .click();

    await expect(panel.getByText('Invited — waiting for them')).toBeVisible({
      timeout: COMPILE_BUDGET,
    });

    /*
     * THE CONSENT RULE. An invitation is not a membership, and this is the
     * assertion a "just add them" implementation would fail.
     */
    const roles = await storedRoles();
    expect(roles[outsiderId]).toBeUndefined();
  });

  test('only the invited student can accept it', async ({ page }) => {
    await signIn(page, outsiderEmail);
    /* Phase 9D retired the Groups tab; invitations answer from Notifications
       now, which is where everything else waiting on you lives. */
    await page.goto('/notifications');

    const inbox = page.getByRole('list', { name: 'Group invitations' });
    await expect(inbox).toContainText('Algorithms crew, renamed');

    await inbox.getByRole('button', { name: 'Join' }).click();

    await expect(page.getByRole('heading', { name: 'You have been invited' })).toHaveCount(0, {
      timeout: COMPILE_BUDGET,
    });

    expect((await storedRoles())[outsiderId]).toBe('member');
  });

  test('a pending request never appears as an invitation, or the reverse', async ({ page }) => {
    /*
     * Both live in group_requests, and the requester of an invitation is the
     * person being invited. Without the kind filter an admin who invites three
     * classmates is told three people are asking to join.
     */
    await signIn(page, founderEmail);
    await page.goto('/notifications');

    await expect(page.getByRole('heading', { name: 'Waiting for you' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'You have been invited' })).toHaveCount(0);
  });
});
