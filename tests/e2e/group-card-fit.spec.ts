/**
 * File:        tests/e2e/group-card-fit.spec.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Phase 11C — the same fit percentage, on the browsing side.
 *
 *              THE POINT IS THAT IT IS THE SAME NUMBER. group-fit.spec.ts proves
 *              the founder sees 100 and 40 for these two shapes of candidate;
 *              this proves the candidates see the same two figures on the card
 *              before they have asked for anything. If the two ever diverge,
 *              both sides are weighing a different thing while making one
 *              decision.
 *
 *              THE THIRD TEST IS THE ONE THAT IS EASY TO GET WRONG. A member
 *              browsing their own group must see no score: they are inside the
 *              intersection it is measured against, so any number there would be
 *              scoring them against a week they helped define.
 * Version:     0.41.0
 *
 * Modifications:
 *     0.41.0 - 2026-08-17 - Initial implementation (Phase 11C)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PW = 'cardfit-1234';
const RUNI = '11111111-1111-4111-8111-111111111111';
const TERM = 'dddd0002-0000-4000-8000-000000000002';
const DEG = 'de600001-0000-4000-8000-000000000001';

test.describe.configure({ mode: 'serial' });

test.describe('group card fit', () => {
  let db: SupabaseClient;
  const s = `${Date.now().toString(36)}`;
  const good = `cf-good-${s}@post.runi.ac.il`;
  const clash = `cf-clash-${s}@post.runi.ac.il`;
  const member = `cf-member-${s}@post.runi.ac.il`;
  let offeringId = '';
  let groupName = '';
  const ids: Record<string, string> = {};

  test.beforeAll(async () => {
    test.skip(!KEY, 'needs service key');
    db = createClient(URL_, KEY, { auth: { persistSession: false } });

    const { data: off } = await db
      .from('course_offerings')
      .select('id, courses!inner(code)')
      .eq('term_id', TERM)
      .eq('courses.code', 'CS-3040')
      .single();
    offeringId = off!.id;

    async function mk(email: string, name: string, slots: [number, string, string][]) {
      const { data } = await db.auth.admin.createUser({ email, password: PW, email_confirm: true });
      const id = data!.user!.id;
      await db
        .from('profiles')
        .update({
          full_name: name,
          degree_id: DEG,
          year_of_study: 2,
          city: 'Herzliya',
          is_discoverable: true,
          onboarding_completed_at: new Date().toISOString(),
        })
        .eq('id', id);
      await db.from('learning_preferences').upsert({
        profile_id: id,
        preferred_time_blocks: ['noon'],
        study_environments: ['quiet'],
        group_sizes: ['small'],
        studies_on_saturday: false,
        spoken_languages: ['he', 'en'],
        study_formats: ['in_person'],
      });
      await db
        .from('enrollments')
        .insert({ profile_id: id, course_offering_id: offeringId, university_id: RUNI });
      if (slots.length) {
        await db.from('availability_slots').insert(
          slots.map(([d, a, b]) => ({ profile_id: id, day_of_week: d, starts_at: a, ends_at: b })),
        );
      }
      ids[email] = id;
      return id;
    }

    const founderId = await mk(`cf-founder-${s}@post.runi.ac.il`, 'Fay Founder', [
      [1, '12:00', '16:00'],
    ]);
    const memberId = await mk(member, 'Milo Member', [[1, '12:00', '16:00']]);
    await mk(good, 'Gina Good', [[1, '12:00', '16:00']]);
    await mk(clash, 'Cody Clash', [[2, '08:00', '22:00']]);

    groupName = `Card fit ${s}`;
    const { data: g } = await db
      .from('study_groups')
      .insert({
        course_offering_id: offeringId,
        university_id: RUNI,
        admin_id: founderId,
        name: groupName,
        max_participants: 5,
      })
      .select('id')
      .single();

    const asked = await db
      .from('group_requests')
      .insert({ group_id: g!.id, requester_id: memberId, status: 'pending' })
      .select('id')
      .single();
    await db
      .from('group_requests')
      .update({ status: 'approved', decided_at: new Date().toISOString(), decided_by: founderId })
      .eq('id', asked.data!.id);
    await db
      .from('study_group_members')
      .insert({ group_id: g!.id, profile_id: memberId, role: 'member' });
  });

  test.afterAll(async () => {
    if (!KEY) return;
    await db.from('study_groups').delete().eq('name', groupName);
    for (const id of Object.values(ids)) await db.auth.admin.deleteUser(id);
  });

  async function signIn(page: Page, email: string) {
    await page.goto('/login');
    await page.getByLabel('University email').pressSequentially(email);
    await page.getByLabel('Password', { exact: true }).fill(PW);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  function card(page: Page) {
    return page
      .getByRole('list', { name: 'Study groups' })
      .getByRole('listitem')
      .filter({ hasText: groupName });
  }

  test('a good fit sees a high score before requesting', async ({ page }) => {
    await signIn(page, good);
    await page.goto(`/courses/${offeringId}`);

    await expect(card(page)).toContainText('100%');
    /* Still only browsing — the score is there before any request exists. */
    await expect(card(page).getByRole('button', { name: 'Request to join' })).toBeVisible();
  });

  test('a scheduling clash sees a low one', async ({ page }) => {
    await signIn(page, clash);
    await page.goto(`/courses/${offeringId}`);

    await expect(card(page)).toContainText('40%');

    const colour = await page.evaluate((name) => {
      const li = [...document.querySelectorAll('li')].find((n) =>
        (n.textContent ?? '').includes(name),
      );
      const badge = [...(li?.querySelectorAll('span') ?? [])].find((n) =>
        /^\d+%$/.test(n.textContent ?? ''),
      );
      return badge ? getComputedStyle(badge).color : null;
    }, groupName);

    /* #FF6B7D — the profile screen's lowest band, from the shared helper. */
    expect(colour).toBe('rgb(255, 107, 125)');
  });

  test('a member of the group sees no score on it', async ({ page }) => {
    await signIn(page, member);
    await page.goto(`/courses/${offeringId}`);

    await expect(card(page)).toBeVisible();
    await expect(card(page).getByText(/^\d+%$/)).toHaveCount(0);
  });
});
