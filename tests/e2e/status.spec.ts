/**
 * File:        tests/e2e/status.spec.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Phase 11A — the line above your avatar, end to end.
 *
 *              THE REMOVE TEST IS THE ONE THAT EARNED ITS PLACE. The picker
 *              opens straight into the text field when the current status is a
 *              custom one, so it can be edited without retyping — and that put
 *              "Remove my status" inside the branch it was not showing, exactly
 *              for the people most likely to want it. Setting a custom status
 *              and then clearing it is the sequence that catches that; picking a
 *              preset and clearing it never would.
 *
 *              The Hebrew presets are asserted through the trigger's accessible
 *              name rather than by text, because the dialog lives inside the
 *              profile header and its buttons stay in the DOM once closed.
 * Version:     0.39.0
 *
 * Modifications:
 *     0.39.0 - 2026-08-17 - Initial implementation (Phase 11A)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PW = 'status-1234';
const RUNI = '11111111-1111-4111-8111-111111111111';
const TERM = 'dddd0002-0000-4000-8000-000000000002';
const DEG = 'de600001-0000-4000-8000-000000000001';

test.describe.configure({ mode: 'serial' });

test.describe('the status bubble', () => {
  let db: SupabaseClient;
  let meId = '', themId = '';
  const s = `${Date.now().toString(36)}`;
  const meEmail = `st-me-${s}@post.runi.ac.il`;

  test.beforeAll(async () => {
    test.skip(!KEY, 'needs service key');
    db = createClient(URL_, KEY, { auth: { persistSession: false } });
    const { data: off } = await db.from('course_offerings')
      .select('id, courses!inner(code)').eq('term_id', TERM).eq('courses.code', 'CS-3040').single();

    async function mk(email: string, name: string) {
      const { data } = await db.auth.admin.createUser({ email, password: PW, email_confirm: true });
      const id = data!.user!.id;
      await db.from('profiles').update({
        full_name: name, degree_id: DEG, year_of_study: 2, city: 'Herzliya',
        is_discoverable: true, onboarding_completed_at: new Date().toISOString(),
      }).eq('id', id);
      await db.from('enrollments').insert({ profile_id: id, course_offering_id: off!.id, university_id: RUNI });
      return id;
    }
    meId = await mk(meEmail, 'Stella Status');
    themId = await mk(`st-them-${s}@post.runi.ac.il`, 'Otto Other');
    await db.from('profiles').update({ status_message: 'בתקופת מבחנים' }).eq('id', themId);
  });

  test.afterAll(async () => {
    if (!KEY) return;
    await db.auth.admin.deleteUser(meId);
    await db.auth.admin.deleteUser(themId);
  });

  async function signIn(page: Page) {
    await page.goto('/login');
    await page.getByLabel('University email').pressSequentially(meEmail);
    await page.getByLabel('Password', { exact: true }).fill(PW);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  test('someone elses status renders as a bubble', async ({ page }) => {
    await signIn(page);
    await page.goto(`/students/${themId}`);
    await expect(page.getByText('בתקופת מבחנים')).toBeVisible();
    /*
     * IT HAS TO FIT INSIDE THE CARD. The avatar is pulled up 64px into a 96px
     * banner, so a bubble hanging above it has about 32px before it reaches the
     * card's top edge — and the card clips. This is the assertion that fails if
     * anybody changes the banner height or the avatar's offset.
     */
    const box = await page.evaluate(() => {
      const bubble = [...document.querySelectorAll('span')].find(
        (n) => n.textContent?.trim() === 'בתקופת מבחנים',
      )!;
      const card = bubble.closest('section')!;
      const img = card.querySelector('img, [class*="rounded-full"]')!;
      const b = bubble.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      return {
        bubbleTop: Math.round(b.top), cardTop: Math.round(c.top),
        clearsCard: b.top >= c.top,
        bubbleHeight: Math.round(b.height),
      };
    });
    expect(box.clearsCard).toBe(true);
  });

  test('own profile: pick, custom, and remove', async ({ page }) => {
    await signIn(page);
    await page.goto(`/students/${meId}`);

    await page.getByRole('button', { name: /Add a status/ }).click();
    await expect(page.getByRole('heading', { name: 'Your status' })).toBeVisible();

    await page.getByRole('dialog').getByRole('button', { name: 'נא לא להפריע' }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
    /* The trigger's accessible name, not the text: the dialog lives inside the
       same section and its preset button stays in the DOM once closed. */
    await expect(
      page.getByRole('button', { name: /Your status: נא לא להפריע/ }),
    ).toBeVisible({ timeout: 15_000 });

    /* Custom text. */
    await page.getByRole('button', { name: /Your status/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'אחר' }).click();
    await page.getByPlaceholder('Write something about yourself...').fill('Deep in chapter 4');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(
      page.getByRole('button', { name: /Your status: Deep in chapter 4/ }),
    ).toBeVisible({ timeout: 15_000 });

    /* Remove. */
    await page.getByRole('button', { name: /Your status/ }).click();
    await page.getByRole('button', { name: 'Remove my status' }).click();
    await expect(page.getByRole('button', { name: /Add a status/ })).toBeVisible({ timeout: 15_000 });

    const { data } = await db.from('profiles').select('status_message').eq('id', meId).single();
    expect(data?.status_message).toBeNull();
  });
});
