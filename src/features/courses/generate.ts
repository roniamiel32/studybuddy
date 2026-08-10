/**
 * File:        src/features/courses/generate.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Generating a course list for a degree with an LLM, and the schema
 *              that decides whether the reply is usable.
 *
 *              WHAT THIS PRODUCES IS A GUESS. The model has no access to any
 *              registrar, so the courses it returns are plausible rather than
 *              real. Everything it writes is stored with `source =
 *              'ai_generated'` and surfaced to students as unverified. That is
 *              the difference between a helpful starting point and the app
 *              asserting something false about a named institution.
 * Version:     0.11.0
 *
 * Modifications:
 *     0.11.0 - 2026-08-09 - Schema moved to features/courses/catalog-schema.ts
 *     0.10.0 - 2026-08-09 - Initial implementation (Smart Course API)
 */

import 'server-only';

import {
  generatedCatalogSchema,
  type GeneratedCourse,
} from '@/features/courses/catalog-schema';
import { completeJson, extractJson } from '@/lib/ai/provider';

/*
 * Re-exported so callers that only need the schema keep importing from one
 * place, even though it now lives in a module without the server-only marker.
 */
export {
  generatedCatalogSchema,
  generatedCourseSchema,
  MAX_GENERATED_COURSES,
} from '@/features/courses/catalog-schema';
export type { GeneratedCourse } from '@/features/courses/catalog-schema';

const SYSTEM_PROMPT = `You list university courses.

Reply with ONLY a JSON array, no prose and no code fences. Each element must be:
{"code": "<course code>", "name": "<course name>", "faculty": "<school or faculty>"}

Rules:
- Return the core required courses of the named degree, not electives or
  seminars.
- Use the institution's real course codes if you know them. If you do not, use a
  short conventional code such as "CS-101" rather than inventing an
  official-looking one.
- Between 8 and 30 courses.
- Do not repeat a code.
- If you do not recognise the institution, return the standard curriculum for
  that degree rather than guessing at institution-specific names.`;

export type GenerationOutcome =
  | { ok: true; courses: GeneratedCourse[]; model: string; latencyMs: number }
  | { ok: false; reason: 'not_configured' | 'request_failed' | 'invalid_output' };

/**
 * Asks the model for the course list of one degree.
 *
 * @param options - The institution and degree to describe.
 * @returns Validated courses, or the reason none are available.
 */
export async function generateCourseCatalog(options: {
  universityName: string;
  degreeName: string;
  degreeLevel: string;
}): Promise<GenerationOutcome> {
  const levelLabel =
    options.degreeLevel === 'masters'
      ? "master's"
      : options.degreeLevel === 'phd'
        ? 'doctoral'
        : "bachelor's";

  const result = await completeJson({
    system: SYSTEM_PROMPT,
    user: `Institution: ${options.universityName}
Degree: ${options.degreeName}
Level: ${levelLabel}

List the core required courses.`,
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason === 'not_configured' ? 'not_configured' : 'request_failed',
    };
  }

  const parsed = generatedCatalogSchema.safeParse(extractJson(result.text));

  if (!parsed.success) {
    /*
     * A reply that does not validate is discarded, and the caller falls back to
     * whatever is already stored. Model output is never trusted into the
     * database unchecked.
     */
    console.error('[courses.generate] reply failed validation:', parsed.error.issues[0]?.message);
    return { ok: false, reason: 'invalid_output' };
  }

  return {
    ok: true,
    courses: parsed.data,
    model: result.model,
    latencyMs: result.latencyMs,
  };
}
