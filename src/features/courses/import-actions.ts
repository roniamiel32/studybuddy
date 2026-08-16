/**
 * File:        src/features/courses/import-actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The server action behind onboarding step 2's schedule import.
 *              Takes either a course name the student typed or a photo/PDF of
 *              their timetable, and returns what the agent found alongside
 *              whether the degree's catalog already has it.
 *
 *              IT DOES NOT WRITE ANYTHING. The reply is a proposal the student
 *              reviews; enrolment still happens through `saveCourses` when they
 *              press Continue. An agent that reads a photo and silently enrols
 *              someone in six courses is a worse product than one that shows its
 *              work, and a much worse one when it misreads the photo.
 *
 *              THE CATALOG IS READ HERE, NOT SENT BY THE CLIENT. The action is
 *              given a degree id and loads that degree's courses itself, through
 *              the caller's own client so RLS decides whether they may see it —
 *              the same tenancy check the Smart Course API route makes. Trusting
 *              a client-supplied catalog would let a tampered request tell the
 *              agent which courses exist, and get an `existingCourseId` back for
 *              a course at another institution.
 *
 *              A separate actions module from `actions.ts`, which is the write
 *              side of the Courses tab. This one belongs to onboarding and
 *              writes nothing.
 * Version:     0.42.0
 *
 * Modifications:
 *     0.42.0 - 2026-08-16 - Initial implementation (schedule import)
 */

'use server';

import { z } from 'zod';

import {
  ACCEPTED_MEDIA_TYPES,
  MAX_UPLOAD_BYTES,
  type CourseReview,
  type ExtractedCourse,
  type ReviewedCourse,
} from '@/features/courses/extract-schema';
import {
  extractCourses,
  matchCourseLocally,
  type ExistingCourse,
  type ExtractionInput,
} from '@/features/courses/extract';
import { isAiConfigured, serverEnv } from '@/lib/env';
import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient, requireUser } from '@/lib/supabase/server';

/** What a student may type into "Missing a course?". */
const typedCourseSchema = z
  .string()
  .trim()
  .min(2, 'Type the course name.')
  .max(160, 'That is longer than a course name.');

const degreeSchema = z.uuid('That degree does not exist.');

interface Catalog {
  existing: ExistingCourse[];
  /** Course id to its current-term offering, which is what a student enrols in. */
  offeringByCourseId: Map<string, string>;
}

/**
 * Loads the degree's current-term catalog.
 *
 * Runs as the caller, so a degree at another university simply returns nothing.
 *
 * @param supabase - The request-scoped client.
 * @param degreeId - The degree to read.
 * @returns The courses the agent will be shown, and their offerings.
 */
async function readCatalog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  degreeId: string,
): Promise<Catalog> {
  const { data } = await supabase
    .from('course_offerings')
    .select('id, courses!inner(id, code, name, degree_id), terms!inner(is_current)')
    .eq('courses.degree_id', degreeId)
    .eq('terms.is_current', true);

  const existing: ExistingCourse[] = [];
  const offeringByCourseId = new Map<string, string>();

  for (const row of data ?? []) {
    existing.push({
      courseId: row.courses.id,
      code: row.courses.code,
      name: row.courses.name,
    });
    offeringByCourseId.set(row.courses.id, row.id);
  }

  existing.sort((a, b) => a.code.localeCompare(b.code));

  return { existing, offeringByCourseId };
}

/**
 * Whether this student may make another course-related model call today.
 *
 * Shares its budget with the Smart Course API, because both are the same task
 * from the log's point of view. See AI_COURSE_GENERATION_DAILY_LIMIT.
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
 * Records one attempt, successful or not.
 *
 * Logged with the admin client because `authenticated` has no insert grant on
 * the log — a student must not be able to erase or forge their own usage, which
 * is what the rate limit counts.
 *
 * @param profileId - The caller.
 * @param outcome   - What the extraction returned.
 * @returns Nothing.
 */
async function logAttempt(
  profileId: string,
  outcome: Awaited<ReturnType<typeof extractCourses>>,
): Promise<void> {
  await createAdminClient()
    .from('ai_generation_log')
    .insert({
      profile_id: profileId,
      task: 'course_generation',
      model: outcome.ok ? outcome.model : (serverEnv().AI_MODEL ?? 'unconfigured'),
      latency_ms: outcome.ok ? outcome.latencyMs : null,
      status: outcome.ok ? 'ok' : outcome.reason === 'invalid_output' ? 'invalid_output' : 'error',
      error_message: outcome.ok ? null : outcome.reason,
    });
}

/**
 * Reads the uploaded file into a base64 content block input.
 *
 * Type and size are checked before anything is encoded — an 80 MB video would
 * otherwise be pulled into memory and base64-inflated before being refused.
 *
 * @param file - The uploaded schedule.
 * @returns The extraction input, or a failed result explaining the refusal.
 */
async function readUpload(
  file: File,
): Promise<
  { ok: true; input: ExtractionInput } | { ok: false; result: ActionResult<CourseReview> }
> {
  if (!(ACCEPTED_MEDIA_TYPES as readonly string[]).includes(file.type)) {
    return {
      ok: false,
      result: fail(
        ERROR_CODES.VALIDATION_FAILED,
        'Upload a photo of your schedule (JPG, PNG, GIF or WEBP) or a PDF.',
        'schedule',
      ),
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      result: fail(
        ERROR_CODES.VALIDATION_FAILED,
        'That file is over 8 MB. A photo of the timetable is enough.',
        'schedule',
      ),
    };
  }

  return {
    ok: true,
    input: {
      kind: 'file',
      mediaType: file.type,
      data: Buffer.from(await file.arrayBuffer()).toString('base64'),
      fileName: file.name,
    },
  };
}

/**
 * Attaches the offering each matched course is enrolled through.
 *
 * A course with no current-term offering keeps `offeringId: null`. It is still
 * shown — the student may well be taking it — but the picker cannot select it,
 * because there is nothing to enrol in.
 *
 * @param courses - Verified entries from the agent.
 * @param catalog - The degree's catalog and offering map.
 * @returns Entries the picker can act on.
 */
function attachOfferings(courses: ExtractedCourse[], catalog: Catalog): ReviewedCourse[] {
  return courses.map((course) => ({
    ...course,
    offeringId: course.existingCourseId
      ? (catalog.offeringByCourseId.get(course.existingCourseId) ?? null)
      : null,
  }));
}

/**
 * Reviews a typed course name or an uploaded schedule against the degree's
 * catalog.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `degreeId`, and one of `courseName` or `schedule`.
 * @returns What the agent found, or a failure the panel can display.
 */
export async function reviewCourseInput(
  previous: ActionResult<CourseReview> | null,
  formData: FormData,
): Promise<ActionResult<CourseReview>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const degreeId = degreeSchema.parse(String(formData.get('degreeId') ?? ''));

    /*
     * Read the degree through the CALLER'S client, so the degrees RLS policy
     * decides whether they may see it. A degree at another university is simply
     * not found — that is the tenancy check, with nothing separate to forget.
     */
    const { data: degree } = await supabase
      .from('degrees')
      .select('id, name')
      .eq('id', degreeId)
      .maybeSingle();

    if (!degree) {
      return fail(
        ERROR_CODES.NOT_FOUND,
        'That degree is not available at your university.',
        'degreeId',
      );
    }

    const upload = formData.get('schedule');
    const typed = formData.get('courseName');

    /* An untouched file input still submits an empty File in some browsers. */
    const hasFile = upload instanceof File && upload.size > 0;
    const hasText = typeof typed === 'string' && typed.trim().length > 0;

    if (hasFile && hasText) {
      return fail(
        ERROR_CODES.VALIDATION_FAILED,
        'Send a schedule or a course name, not both at once.',
      );
    }

    if (!hasFile && !hasText) {
      return fail(
        ERROR_CODES.VALIDATION_FAILED,
        'Type a course name, or choose a schedule to upload.',
      );
    }

    const catalog = await readCatalog(supabase, degreeId);

    let input: ExtractionInput;

    if (hasFile) {
      const read = await readUpload(upload as File);
      if (!read.ok) {
        return read.result;
      }
      input = read.input;
    } else {
      input = { kind: 'text', text: typedCourseSchema.parse(typed) };
    }

    /*
     * With no model configured, typed input still resolves against the catalog
     * by comparison key. A file cannot: there is nothing here that reads a
     * photo, and pretending otherwise would return an empty list that looks
     * like "your schedule has no courses on it".
     */
    if (!isAiConfigured()) {
      if (input.kind === 'file') {
        return fail(
          ERROR_CODES.AI_UNAVAILABLE,
          'Reading a schedule is switched off right now. You can still search for your courses, or add one by name.',
        );
      }

      return ok({
        source: 'text',
        courses: attachOfferings([matchCourseLocally(input.text, catalog.existing)], catalog),
        generatedByAi: false,
      });
    }

    if (!(await withinDailyCap(user.id))) {
      return fail(
        ERROR_CODES.RATE_LIMITED,
        'You have used today’s schedule scans. Search for your courses instead, or try again tomorrow.',
      );
    }

    const outcome = await extractCourses({
      input,
      degreeName: degree.name,
      existing: catalog.existing,
    });

    /* Logged before the outcome is inspected — the rate limit counts attempts. */
    await logAttempt(user.id, outcome);

    if (!outcome.ok) {
      /*
       * A typed name still has the deterministic path to fall back to, so a
       * failed call there is a degraded result rather than a dead end. A file
       * has nothing to fall back to.
       */
      if (input.kind === 'text') {
        return ok({
          source: 'text',
          courses: attachOfferings([matchCourseLocally(input.text, catalog.existing)], catalog),
          generatedByAi: false,
        });
      }

      return fail(
        ERROR_CODES.AI_UNAVAILABLE,
        'We could not read that schedule. Try a clearer photo, or search for your courses instead.',
        'schedule',
      );
    }

    return ok({
      source: input.kind,
      courses: attachOfferings(outcome.courses, catalog),
      generatedByAi: true,
    });
  } catch (error) {
    return toActionError(error, 'courses.reviewCourseInput');
  }
}
