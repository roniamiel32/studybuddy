/**
 * File:        tests/e2e/landing.spec.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: End-to-end smoke test proving the Phase 0.5 exit criterion —
 *              the app boots and serves the landing page. Replaced by real
 *              journey tests as features land.
 * Version:     0.2.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Initial smoke test (Phase 0.5 scaffold)
 */

import { expect, test } from '@playwright/test';

test.describe('landing page', () => {
  test('serves the landing page with its primary call to action', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText('study partner');
    await expect(page.getByRole('link', { name: /get started/i })).toBeVisible();
  });

  test('reports no console errors on first load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text());
      }
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
