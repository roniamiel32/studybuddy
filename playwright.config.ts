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

/*
 * Playwright does not read .env files, and the onboarding spec needs the
 * service-role key to delete the accounts it creates. Without this the suite
 * still passes but leaves test users behind in auth.users.
 */
try {
  process.loadEnvFile('.env.local');
} catch {
  /* No .env.local — fine for the landing-page tests, which need no database. */
}

const PORT = Number(process.env.PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  /*
   * One worker, deliberately.
   *
   * The suite runs against the Next dev server, which compiles each route on
   * first request. Parallel workers all block on the same Turbopack build and
   * time out — a failure that looks like a broken redirect but is only a cold
   * cache. Serialising costs about thirty seconds and removes an entire class
   * of false failure. Running against a production build would be the other
   * fix, at the cost of a rebuild on every run.
   */
  fullyParallel: false,
  workers: 1,
  /* A committed .only is nearly always an accident, so fail CI on it. */
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  /*
   * 15s rather than the 5s default. These specs run against the dev server,
   * which compiles a route the first time it is requested, so the navigation
   * that follows a form submission can legitimately take several seconds. The
   * default made a cold cache look like a broken redirect.
   */
  expect: { timeout: 15_000 },
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
