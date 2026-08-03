/**
 * File:        vitest.config.mts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Vitest configuration for unit and integration tests. End-to-end
 *              tests are excluded here because Playwright owns them.
 * Version:     0.2.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Initial configuration (Phase 0.5 scaffold)
 */

import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/integration/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
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
