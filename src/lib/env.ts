/**
 * File:        src/lib/env.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Runtime-validated environment configuration. Parses and
 *              validates every environment variable the application depends
 *              on, so a missing or malformed value fails immediately and
 *              loudly rather than surfacing as a confusing runtime error
 *              deep inside a Supabase or AI call.
 * Version:     0.10.0
 *
 * Modifications:
 *     0.10.0 - 2026-08-09 - Anthropic provider; per-task course generation cap
 *     0.2.0 - 2026-08-03 - Initial implementation (Phase 0.5 scaffold)
 */

import { z } from 'zod';

/**
 * Variables that are safe to expose to the browser.
 *
 * Next.js inlines `NEXT_PUBLIC_*` values at build time, so these must be
 * referenced as static property accesses on `process.env` — a dynamic lookup
 * such as `process.env[key]` is not replaced by the bundler and resolves to
 * `undefined` in the browser.
 */
const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url('must be a full URL, e.g. http://127.0.0.1:54321'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'looks too short to be a Supabase anon key'),
  NEXT_PUBLIC_SITE_URL: z.url('must be a full URL, e.g. http://localhost:3000'),
});

/**
 * Server-only variables. These must never be imported into a client
 * component; `serverEnv()` throws if that is attempted.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20, 'looks too short to be a Supabase service role key'),
  /*
   * 'anthropic' added for the Smart Course API. The PRD named OpenAI and Gemini;
   * Claude was explicitly permitted later, and the provider module speaks to the
   * Anthropic Messages API over plain fetch.
   */
  AI_PROVIDER: z.enum(['openai', 'gemini', 'anthropic']).default('anthropic'),
  /*
   * Optional: absent means AI features are switched off and matching falls
   * back to the deterministic SQL ranking. An empty assignment (`AI_API_KEY=`)
   * is normalised to absent, because a half-filled .env file is a routine
   * state during development and must not crash the whole app.
   */
  AI_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(10, 'looks too short to be an API key').optional(),
  ),
  /*
   * Deliberately has no default: pinning a model id in source guarantees it
   * goes stale. The AI provider module rejects a configuration that supplies a
   * key without a model.
   */
  AI_MODEL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(1).optional(),
  ),
  /** Per-user daily cap on AI match re-ranks. See design doc section 6.4. */
  AI_RERANK_DAILY_LIMIT: z.coerce.number().int().positive().default(20),
  /** Per-user daily cap on AI icebreaker generations. */
  AI_ICEBREAKER_DAILY_LIMIT: z.coerce.number().int().positive().default(30),
  /*
   * Per-user daily cap on course-catalog generations, counted separately from
   * the other two. A student needs one catalog per degree and almost never a
   * second, so the cap is low; sharing the re-rank budget would mean tuning
   * either one silently changed the other.
   */
  AI_COURSE_GENERATION_DAILY_LIMIT: z.coerce.number().int().positive().default(5),
  /** Hours a cached row in `match_scores` stays fresh. */
  MATCH_CACHE_TTL_HOURS: z.coerce.number().int().positive().default(24),
});

export type ClientEnv = z.infer<typeof clientSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

/**
 * Formats a Zod error into a message that names every offending variable,
 * so a developer fixes all of them in one pass instead of one per restart.
 *
 * @param error - The validation error produced by a failed `safeParse`.
 * @param scope - Either 'client' or 'server', used in the message heading.
 * @returns A multi-line, human-readable description of what is wrong.
 */
function formatEnvError(error: z.ZodError, scope: 'client' | 'server'): string {
  const lines = error.issues.map((issue) => {
    const name = issue.path.join('.') || '(root)';
    return `  - ${name}: ${issue.message}`;
  });

  return [
    `Invalid ${scope} environment configuration:`,
    ...lines,
    '',
    'Copy .env.example to .env.local and fill in the missing values.',
  ].join('\n');
}

let cachedClientEnv: ClientEnv | undefined;
let cachedServerEnv: ServerEnv | undefined;

/**
 * Returns the validated browser-safe environment.
 *
 * @returns The parsed client environment.
 * @throws Error if any required `NEXT_PUBLIC_*` variable is missing or malformed.
 */
export function clientEnv(): ClientEnv {
  if (cachedClientEnv) {
    return cachedClientEnv;
  }

  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (!parsed.success) {
    throw new Error(formatEnvError(parsed.error, 'client'));
  }

  cachedClientEnv = parsed.data;
  return cachedClientEnv;
}

/**
 * Returns the validated server-only environment.
 *
 * @returns The parsed server environment.
 * @throws Error if called in a browser bundle, or if a required variable is
 *         missing or malformed.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error(
      'serverEnv() was called in the browser. Server-only secrets must never ' +
        'reach the client bundle — move this call into a server component, ' +
        'server action, or route handler.',
    );
  }

  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(formatEnvError(parsed.error, 'server'));
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

/**
 * Reports whether AI features are configured.
 *
 * The application is designed to degrade gracefully: with no AI key, matching
 * still works using the deterministic SQL ranking. Callers use this to decide
 * whether to attempt a re-rank at all.
 *
 * Requires both a key and a model — a key without a model cannot produce a
 * request, and silently guessing a model id is worse than reporting the
 * feature as unconfigured.
 *
 * @returns True when both an AI API key and a model are present.
 */
export function isAiConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.AI_API_KEY && env.AI_MODEL);
}

/**
 * Clears the memoised environment. Test-only.
 *
 * @returns Nothing.
 */
export function resetEnvCacheForTests(): void {
  cachedClientEnv = undefined;
  cachedServerEnv = undefined;
}
