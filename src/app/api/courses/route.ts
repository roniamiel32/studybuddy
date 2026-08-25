/**
 * File:        src/app/api/courses/route.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Smart Course API.
 *
 *              POST { degreeId } -> the course list for that degree, generating
 *              it with an LLM the first time nobody has one.
 *
 *              IT NEVER RETURNS AN EMPTY LIST for a degree it recognises. The
 *              matching engine runs on shared courses, so a student who leaves
 *              step 2 with none cannot be matched on anything — an empty catalog
 *              is a dead end rather than a neutral outcome. With no model
 *              configured, or with one that fails, it stores the stock
 *              curriculum for the degree instead, marked 'placeholder'.
 *
 *              A route handler rather than a server action because it is slow
 *              (a model call), needs its own rate limit, and the client wants to
 *              show a loading state and be able to abandon it.
 *
 *              THE TENANCY CHECK IS THE IMPORTANT PART. The request names a
 *              degree, and this handler writes to the database on the strength
 *              of it. It therefore verifies the degree belongs to the caller's
 *              own university before doing anything, so the endpoint cannot be
 *              used to read or populate another institution's catalog.
 * Version:     0.11.0
 *
 * Modifications:
 *     0.11.0 - 2026-08-09 - Placeholder fallback, so the endpoint never returns
 *                           an empty catalog for a recognised degree
 *     0.10.0 - 2026-08-09 - Initial implementation
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';

import type { CourseSource, GeneratedCourse } from '@/features/courses/catalog-schema';
import { generateCourseCatalog } from '@/features/courses/generate';
import { placeholderCatalog } from '@/features/courses/placeholder-catalog';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isAiConfigured, serverEnv } from '@/lib/env';

const requestSchema = z.object({ degreeId: z.uuid() });

export interface CourseApiCourse {
  offeringId: string;
  courseId: string;
  code: string;
  name: string;
  faculty: string | null;
  /** See UNVERIFIED_SOURCES: two of these values are shown as unverified. */
  source: CourseSource;
}

export interface CourseApiResponse {
  courses: CourseApiCourse[];
  /**
   * How the list was obtained, so the UI can explain itself.
   *
   * 'generated' came from a model and is its guess at this institution's
   * syllabus; 'placeholder' is the stock curriculum for the degree, which was
   * never about this institution at all. Both need saying out loud, but they do
   * not say the same thing.
   */
  origin: 'existing' | 'generated' | 'placeholder' | 'unavailable';
  message?: string;
}

/**
 * Reads the current-term offerings for a degree.
 *
 * @param supabase - A client; the caller's own, so RLS still applies on reads.
 * @param degreeId - The degree to list.
 * @returns Offerings with their course details.
 */
async function readCatalog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  degreeId: string,
): Promise<CourseApiCourse[]> {
  const { data } = await supabase
    .from('course_offerings')
    .select('id, courses!inner(id, code, name, faculty, source, degree_id), terms!inner(is_current)')
    .eq('courses.degree_id', degreeId)
    .eq('terms.is_current', true);

  return (data ?? [])
    .map((row) => ({
      offeringId: row.id,
      courseId: row.courses.id,
      code: row.courses.code,
      name: row.courses.name,
      faculty: row.courses.faculty,
      source: row.courses.source,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

interface CatalogContext {
  degreeId: string;
  universityId: string;
  universityName: string;
  degreeName: string;
  degreeLevel: string;
  profileId: string;
  currentTermId: string;
}

/**
 * Writes a catalog and makes every course of the degree enrollable this term.
 *
 * @param courses - Validated courses to store.
 * @param source  - Provenance, which the UI turns into a warning.
 * @param context - Institution, degree and term identity.
 * @returns Whether the degree now has anything to offer.
 */
async function storeCatalog(
  courses: GeneratedCourse[],
  source: 'ai_generated' | 'placeholder',
  context: CatalogContext,
): Promise<boolean> {
  /*
   * Written with the admin client: course rows are reference data, and
   * `authenticated` has no insert grant on `courses` by design — a student may
   * choose courses, not invent them. The tenancy check upstream is what makes
   * this safe.
   */
  const admin = createAdminClient();

  const { error } = await admin.from('courses').upsert(
    courses.map((course) => ({
      university_id: context.universityId,
      degree_id: context.degreeId,
      code: course.code.toUpperCase(),
      name: course.name,
      faculty: course.faculty ?? null,
      source,
      generated_at: new Date().toISOString(),
    })),
    /* Two students triggering this at once must not create duplicates. */
    { onConflict: 'university_id,code', ignoreDuplicates: true },
  );

  if (error) {
    console.error('[api/courses] storing courses failed:', error.message);
    return false;
  }

  /* A course with no offering in the current term cannot be enrolled in. */
  const { data: allForDegree } = await admin
    .from('courses')
    .select('id')
    .eq('degree_id', context.degreeId);

  if (!allForDegree || allForDegree.length === 0) {
    return false;
  }

  await admin.from('course_offerings').upsert(
    allForDegree.map((course) => ({
      course_id: course.id,
      term_id: context.currentTermId,
    })),
    { onConflict: 'course_id,term_id', ignoreDuplicates: true },
  );

  return true;
}

/**
 * Asks the model for a catalog, logs the attempt, and stores what comes back.
 *
 * @param context - Institution, degree and term identity.
 * @returns Whether a generated catalog was stored.
 */
async function generateAndStore(context: CatalogContext): Promise<boolean> {
  const outcome = await generateCourseCatalog({
    universityName: context.universityName,
    degreeName: context.degreeName,
    degreeLevel: context.degreeLevel,
  });

  /* Log every attempt, successful or not — this is what the rate limit counts. */
  await createAdminClient()
    .from('ai_generation_log')
    .insert({
      profile_id: context.profileId,
      task: 'course_generation',
      model: outcome.ok ? outcome.model : (serverEnv().AI_MODEL ?? 'unconfigured'),
      latency_ms: outcome.ok ? outcome.latencyMs : null,
      status: outcome.ok ? 'ok' : outcome.reason === 'invalid_output' ? 'invalid_output' : 'error',
      error_message: outcome.ok ? null : outcome.reason,
    });

  if (!outcome.ok) {
    return false;
  }

  return storeCatalog(outcome.courses, 'ai_generated', context);
}

/**
 * Whether this student may make another model call today.
 *
 * Scoped to this task. The log records every kind of model call, so counting all
 * of them would let Phase 3's re-ranks exhaust a student's ability to build a
 * course list — two unrelated features rationing each other.
 *
 * @param profileId - The caller.
 * @returns True when they are under the cap.
 */
async function withinDailyCap(profileId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await createAdminClient()
    .from('ai_generation_log')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('task', 'course_generation')
    .gte('created_at', since);

  return (count ?? 0) < serverEnv().AI_COURSE_GENERATION_DAILY_LIMIT;
}

/**
 * Handles a catalog request.
 *
 * @param request - Carries `{ degreeId }`.
 * @returns The course list and where it came from.
 */
export async function POST(request: Request): Promise<NextResponse<CourseApiResponse>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { courses: [], origin: 'unavailable', message: 'Sign in first.' },
      { status: 401 },
    );
  }

  let degreeId: string;
  try {
    ({ degreeId } = requestSchema.parse(await request.json()));
  } catch {
    return NextResponse.json(
      { courses: [], origin: 'unavailable', message: 'A degree is required.' },
      { status: 400 },
    );
  }

  /*
   * Read the degree through the CALLER'S client, so the degrees RLS policy
   * decides whether they may see it. A degree at another university simply is
   * not found, which is the tenancy check — no separate comparison needed, and
   * nothing to get wrong.
   */
  const { data: degree } = await supabase
    .from('degrees')
    .select('id, name, level, university_id, universities(name)')
    .eq('id', degreeId)
    .maybeSingle();

  if (!degree) {
    return NextResponse.json(
      { courses: [], origin: 'unavailable', message: 'That degree is not available at your university.' },
      { status: 404 },
    );
  }

  const existing = await readCatalog(supabase, degreeId);

  if (existing.length > 0) {
    return NextResponse.json({ courses: existing, origin: 'existing' });
  }

  const { data: term } = await supabase
    .from('terms')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();

  if (!term) {
    /*
     * Not recoverable here, and not the student's problem to solve: without a
     * current term there is nothing for an offering to hang off, so even a
     * placeholder catalog could not be enrolled in.
     */
    return NextResponse.json({
      courses: [],
      origin: 'unavailable',
      message: 'Your university has no active semester yet.',
    });
  }

  const context: CatalogContext = {
    degreeId,
    universityId: degree.university_id,
    universityName: degree.universities?.name ?? 'this university',
    degreeName: degree.name,
    degreeLevel: degree.level,
    profileId: user.id,
    currentTermId: term.id,
  };

  /*
   * The model is tried only when there is a model to try, and only within the
   * daily cap. Both misses fall through to the placeholder catalog rather than
   * returning nothing — an unconfigured key is a deployment state, not a reason
   * to hand a student an empty step 2.
   */
  let generated = false;

  if (isAiConfigured() && (await withinDailyCap(user.id))) {
    generated = await generateAndStore(context);
  }

  if (generated) {
    return NextResponse.json({
      courses: await readCatalog(supabase, degreeId),
      origin: 'generated',
    });
  }

  const stored = await storeCatalog(placeholderCatalog(degree.name, degree.level), 'placeholder', context);

  if (!stored) {
    return NextResponse.json({
      courses: [],
      origin: 'unavailable',
      message: 'We could not build a course list for this degree just now.',
    });
  }

  return NextResponse.json({
    courses: await readCatalog(supabase, degreeId),
    origin: 'placeholder',
  });
}
