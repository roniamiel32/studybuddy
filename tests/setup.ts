/**
 * File:        tests/setup.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Global test setup. Registers jest-dom matchers and clears the
 *              environment cache between tests so that env-validation tests
 *              cannot leak state into one another.
 * Version:     0.2.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Initial setup (Phase 0.5 scaffold)
 */

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

import { resetEnvCacheForTests } from '@/lib/env';

afterEach(() => {
  cleanup();
  resetEnvCacheForTests();
});
