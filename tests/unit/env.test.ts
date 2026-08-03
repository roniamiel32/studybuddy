/**
 * File:        tests/unit/env.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Unit tests for the environment validator. The point of
 *              lib/env.ts is to fail fast and name every offending variable,
 *              so these tests assert on the failure behaviour as much as on
 *              the happy path.
 * Version:     0.2.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Initial tests (Phase 0.5 scaffold)
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { clientEnv, isAiConfigured, serverEnv } from '@/lib/env';

const VALID_PUBLIC = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a'.repeat(40),
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
};

const VALID_SECRETS = {
  SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(40),
};

/**
 * Applies a set of environment variables for the duration of one test.
 *
 * @param vars - Variables to stub onto process.env.
 * @returns Nothing.
 */
function stubEnv(vars: Record<string, string>): void {
  for (const [key, value] of Object.entries(vars)) {
    vi.stubEnv(key, value);
  }
}

/**
 * Removes `window`, making the module believe it is running on the server.
 *
 * `typeof window` evaluates to 'undefined' when the global holds `undefined`,
 * which is exactly what the guard in serverEnv() checks.
 *
 * @returns Nothing.
 */
function pretendServerRuntime(): void {
  vi.stubGlobal('window', undefined);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('clientEnv', () => {
  it('returns the parsed public configuration when every variable is present', () => {
    stubEnv(VALID_PUBLIC);

    expect(clientEnv()).toEqual(VALID_PUBLIC);
  });

  it('names every missing variable in one error, not just the first', () => {
    stubEnv({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' });
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');

    let message = '';
    try {
      clientEnv();
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    expect(message).toContain('NEXT_PUBLIC_SITE_URL');
    expect(message).toContain('.env.example');
  });

  it('rejects a Supabase URL that is not a full URL', () => {
    stubEnv({ ...VALID_PUBLIC, NEXT_PUBLIC_SUPABASE_URL: '127.0.0.1:54321' });

    expect(() => clientEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('rejects an anon key that is too short to be real', () => {
    stubEnv({ ...VALID_PUBLIC, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'short' });

    expect(() => clientEnv()).toThrow(/too short/);
  });

  it('memoises the parsed result', () => {
    stubEnv(VALID_PUBLIC);

    expect(clientEnv()).toBe(clientEnv());
  });
});

describe('serverEnv', () => {
  it('refuses to run in a browser bundle', () => {
    stubEnv({ ...VALID_PUBLIC, ...VALID_SECRETS });

    // jsdom provides `window`, so this exercises the real guard.
    expect(() => serverEnv()).toThrow(/must never\s+reach the client bundle|called in the browser/);
  });

  it('applies documented defaults for the AI knobs', () => {
    pretendServerRuntime();
    stubEnv(VALID_SECRETS);

    const env = serverEnv();

    expect(env.AI_PROVIDER).toBe('openai');
    expect(env.AI_RERANK_DAILY_LIMIT).toBe(20);
    expect(env.AI_ICEBREAKER_DAILY_LIMIT).toBe(30);
    expect(env.MATCH_CACHE_TTL_HOURS).toBe(24);
  });

  it('coerces numeric limits supplied as strings', () => {
    pretendServerRuntime();
    stubEnv({ ...VALID_SECRETS, AI_RERANK_DAILY_LIMIT: '5', MATCH_CACHE_TTL_HOURS: '48' });

    const env = serverEnv();

    expect(env.AI_RERANK_DAILY_LIMIT).toBe(5);
    expect(env.MATCH_CACHE_TTL_HOURS).toBe(48);
  });

  it('rejects an unknown AI provider', () => {
    pretendServerRuntime();
    stubEnv({ ...VALID_SECRETS, AI_PROVIDER: 'claude-but-misspelled' });

    expect(() => serverEnv()).toThrow(/AI_PROVIDER/);
  });

  it('rejects a non-positive rate limit', () => {
    pretendServerRuntime();
    stubEnv({ ...VALID_SECRETS, AI_RERANK_DAILY_LIMIT: '0' });

    expect(() => serverEnv()).toThrow(/AI_RERANK_DAILY_LIMIT/);
  });

  it('requires the service role key', () => {
    pretendServerRuntime();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    expect(() => serverEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe('isAiConfigured', () => {
  it('is false when no AI key is set, so matching falls back to SQL ranking', () => {
    pretendServerRuntime();
    stubEnv(VALID_SECRETS);
    vi.stubEnv('AI_API_KEY', undefined);

    expect(isAiConfigured()).toBe(false);
  });

  it('treats an empty AI_API_KEY assignment as unconfigured rather than invalid', () => {
    pretendServerRuntime();
    stubEnv({ ...VALID_SECRETS, AI_API_KEY: '', AI_MODEL: '' });

    expect(() => serverEnv()).not.toThrow();
    expect(isAiConfigured()).toBe(false);
  });

  it('is false when a key is present but no model is named', () => {
    pretendServerRuntime();
    stubEnv({ ...VALID_SECRETS, AI_API_KEY: 'k'.repeat(20) });
    vi.stubEnv('AI_MODEL', undefined);

    expect(isAiConfigured()).toBe(false);
  });

  it('is true once both a key and a model are present', () => {
    pretendServerRuntime();
    stubEnv({ ...VALID_SECRETS, AI_API_KEY: 'k'.repeat(20), AI_MODEL: 'some-model-id' });

    expect(isAiConfigured()).toBe(true);
  });
});
