/**
 * File:        playwright.config.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: End-to-end test configuration. Starts the dev server itself so
 *              `npm run test:e2e` works from a clean checkout without a second
 *              terminal.
 * Version:     0.2.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Initial configuration (Phase 0.5 scaffold)
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  /* A committed .only is nearly always an accident, so fail CI on it. */
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    /* Students overwhelmingly use phones; the mobile pass is not optional. */
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
