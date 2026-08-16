/**
 * File:        tests/e2e/group-fit.spec.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Phase 11B — the fit percentage beside an applicant's name.
 *
 *              THE TWO APPLICANTS ARE IDENTICAL EXCEPT FOR THEIR HOURS, and that
 *              is the whole test. Same degree, same year, same city, same five
 *              preference answers — so the trait half of the score is a constant
 *              and every point of difference between 100 and 40 comes from
 *              whether they can make the hours the group already shares. That is
 *              the case a founder could not see before: Casper is free fourteen
 *              hours a week and none of them are the group's.
 *
 *              THE COLOURS ARE ASSERTED AS COMPUTED VALUES rather than class
 *              names, because the requirement was to reuse the profile screen's
 *              three bands exactly. Reading them back off the element is what
 *              proves the same function decided them.
 * Version:     0.40.0
 *
 * Modifications:
 *     0.40.0 - 2026-08-17 - Initial implementation (Phase 11B)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PW = 'fit-1234';
const RUNI = '11111111-1111-4111-8111-111111111111';
const TERM = 'dddd0002-0000-4000-8000-000000000002';
const DEG = 'de600001-0000-4000-8000-000000000001';

test('the founder sees a group fit beside each applicant', async ({ page }) => {
  test.skip(!KEY, 'needs service key');
  const db: SupabaseClient = createClient(URL_, KEY, { auth: { persistSession: false } });
  const s = `${Date.now().toString(36)}`;
  const founderEmail = `gf-founder-${s}@post.runi.ac.il`;

  const { data: off } = await db
    .from('course_offerings')
    .select('id, courses!inner(code)')
    .eq('term_id', TERM)
    .eq('courses.code', 'CS-3040')
    .single();

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
      .insert({ profile_id: id, course_offering_id: off!.id, university_id: RUNI });
    if (slots.length) {
      await db.from('availability_slots').insert(
        slots.map(([d, a, b]) => ({ profile_id: id, day_of_week: d, starts_at: a, ends_at: b })),
      );
    }
    return id;
  }

  /* The group is free Monday 12-16. Everyone shares identical study habits, so
     the only thing separating the two applicants is the hours. */
  const founderId = await mk(founderEmail, 'Fiona Founder', [[1, '12:00', '16:00']]);
  const memberId = await mk(`gf-member-${s}@post.runi.ac.il`, 'Mo Member', [[1, '12:00', '16:00']]);
  const goodId = await mk(`gf-good-${s}@post.runi.ac.il`, 'Gaia Good', [[1, '12:00', '16:00']]);
  const clashId = await mk(`gf-clash-${s}@post.runi.ac.il`, 'Casper Clash', [[2, '08:00', '22:00']]);

  const { data: g } = await db
    .from('study_groups')
    .insert({
      course_offering_id: off!.id,
      university_id: RUNI,
      admin_id: founderId,
      name: `Fit crew ${s}`,
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
    .update({
      status: 'approved',
      decided_at: new Date().toISOString(),
      decided_by: founderId,
    })
    .eq('id', asked.data!.id);
  await db
    .from('study_group_members')
    .insert({ group_id: g!.id, profile_id: memberId, role: 'member' });

  for (const id of [goodId, clashId]) {
    await db.from('group_requests').insert({ group_id: g!.id, requester_id: id, status: 'pending' });
  }

  await page.goto('/login');
  await page.getByLabel('University email').pressSequentially(founderEmail);
  await page.getByLabel('Password', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto(`/groups/${g!.id}`);
  await page.getByRole('button', { name: 'Show members' }).click();

  const list = page.getByRole('list', { name: 'Pending requests' });
  const good = list.getByRole('listitem').filter({ hasText: 'Gaia Good' });
  const clash = list.getByRole('listitem').filter({ hasText: 'Casper Clash' });

  await expect(good).toContainText('100%');
  await expect(clash).toContainText('40%');

  const colours = await page.evaluate(() =>
    [...document.querySelectorAll('li')]
      .filter((li) => /Gaia Good|Casper Clash/.test(li.textContent ?? ''))
      .map((li) => {
        const badge = [...li.querySelectorAll('span')].find((n) =>
          /^\d+%$/.test(n.textContent ?? ''),
        );
        return {
          who: /Gaia/.test(li.textContent ?? '') ? 'good' : 'clash',
          colour: badge ? getComputedStyle(badge).color : null,
        };
      }),
  );
  /* #4f7b58 above 79, #FF6B7D at or below 40 — the profile screen's bands. */
  expect(colours).toEqual(
    expect.arrayContaining([
      { who: 'good', colour: 'rgb(79, 123, 88)' },
      { who: 'clash', colour: 'rgb(255, 107, 125)' },
    ]),
  );
  await good.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('dialog').getByText('100%')).toBeVisible();

  await db.from('study_groups').delete().eq('id', g!.id);
  for (const id of [founderId, memberId, goodId, clashId]) {
    await db.auth.admin.deleteUser(id);
  }
});
