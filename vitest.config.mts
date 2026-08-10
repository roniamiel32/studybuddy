/**
 * File:        vitest.config.mts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Vitest configuration for unit and integration tests. End-to-end
 *              tests are excluded here because Playwright owns them.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.2.0  - 2026-08-03 - Initial configuration (Phase 0.5 scaffold)
 *     0.14.0 - 2026-08-10 - Serial test files and a longer hook timeout, because
 *                           every integration suite shares one local Supabase
 */

import path from 'node:path';

import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/*
 * Integration tests talk to the local Supabase stack, so they need the same
 * variables the app reads. Vitest does not load .env files on its own, and
 * without this the integration suite would silently skip on a machine that is
 * otherwise correctly set up — the worst failure mode for a test.
 */
process.env = {
  ...process.env,
  ...loadEnv('test', import.meta.dirname, ''),
};

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    /*
     * One file at a time, for the same reason Playwright runs with a single
     * worker: every integration suite creates real auth users in the SAME local
     * Supabase, and running four of them at once makes the auth server slow
     * enough that `createUser` blows the default 5s timeout. The failure looks
     * like a broken schema and is really contention — and it appeared the moment
     * Phase 4 added a fourth suite.
     *
     * The unit tests pay a little for this. Worth it: a suite that fails for
     * reasons unrelated to the code teaches people to re-run rather than read.
     */
    fileParallelism: false,
    /* Fixtures create several students each; 5s was never generous. */
    hookTimeout: 90_000,
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/features/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
