/**
 * File:        src/features/courses/extract.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The course-extraction agent. Reads either a line of text a
 *              student typed or a photo/PDF of their timetable, and reports
 *              which courses it found, whether each is a real course, and
 *              whether the degree's catalog already has it.
 *
 *              THE MODEL DOES THE READING; THIS MODULE DOES THE TRUSTING. A
 *              reply is validated against a schema, then every `existingCourseId`
 *              is looked up in the catalog that was actually sent — an id the
 *              model invented is dropped and the course demoted to "new", rather
 *              than being carried into the UI as a match to a course that does
 *              not exist.
 *
 *              There is also a fallback with no model in it at all. Typed input
 *              still matches against the catalog by comparison key, so "Missing
 *              a course?" keeps working on a deployment with no AI key — the
 *              same principle as the placeholder catalog in the Smart Course API.
 * Version:     0.42.0
 *
 * Modifications:
 *     0.42.0 - 2026-08-16 - Initial implementation (schedule import)
 */

import 'server-only';

import {
  extractionSchema,
  MAX_EXTRACTED_COURSES,
  type ExistingCourse,
  type ExtractedCourse,
} from '@/features/courses/extract-schema';
import { completeJson, extractJson, type AiContentBlock } from '@/lib/ai/provider';

/*
 * Re-exported so callers keep importing the extraction surface from one place,
 * even though the pure halves live in a module without the server-only marker
 * so the unit tests can reach them.
 */
export { matchCourseLocally } from '@/features/courses/extract-schema';
export type { ExistingCourse } from '@/features/courses/extract-schema';

export type ExtractionInput =
  | { kind: 'text'; text: string }
  | { kind: 'file'; mediaType: string; data: string; fileName: string };

export type ExtractionOutcome =
  | { ok: true; courses: ExtractedCourse[]; model: string; latencyMs: number }
  | { ok: false; reason: 'not_configured' | 'request_failed' | 'invalid_output' };

/*
 * The whole contract is in the system prompt, including the JSON shape.
 *
 * The "no markdown" instruction is worth stating even though `extractJson`
 * strips fences anyway: it costs one line and removes the most common way a
 * reply fails to parse. It is not relied upon — the parser assumes it will be
 * ignored sometimes.
 */
const SYSTEM_PROMPT = `You read university course information and report what you found.

Reply with ONLY a JSON object. No prose, no explanation, no markdown code fences.

The object must be exactly:
{"extractedCourses":[{"courseName":"string","courseNumber":"string or null","isValid":true,"isDuplicate":false,"existingCourseId":"string or null","reason":"string"}]}

For each course you identify:

courseName
- The academic course name, cleaned up. Fix obvious OCR damage. Do not include
  the lecturer, the room, the day, the hour, or the semester.

courseNumber
- The institution's course code if the source shows one, otherwise null. Never
  invent one.

isValid
- true when this is a plausible academic course.
- false for anything that is not a course: a break, lunch, a room number, a
  building, a lecturer's name, "free period", a day heading, an exam date, a
  registration deadline, or text you could not read well enough to be sure.
- When isValid is false, still return the entry. Say why in reason. The student
  decides what to do with it, not you.

isDuplicate and existingCourseId
- Compare against the EXISTING COURSES list in the user message.
- Set isDuplicate true and existingCourseId to that course's id when the
  identified course is the same course under a different wording: an exact
  match, an abbreviation ("Intro to CS" / "Introduction to Computer Science"),
  a translation, a different transliteration, or the same course code.
- Set isDuplicate false and existingCourseId null when it is genuinely a
  different course. Two courses that share a subject are NOT duplicates —
  "Calculus 1" and "Calculus 2" are different courses.
- Only ever use an id that appears in the list. Never construct one.

reason
- One short sentence, addressed to the student, explaining the call you made.
  "Already in your course list as CS-101." / "This is a lunch break, not a
  course." / "Not in the catalog yet — you can still add it."

Return at most ${MAX_EXTRACTED_COURSES} courses. Return an empty array if the
source contains no courses at all.`;

/**
 * Renders the catalog for the prompt.
 *
 * Ids are included because the reply has to point back at one, and codes and
 * names because that is what the model is matching against. Nothing else about
 * a course is sent — the agent has no business knowing who is enrolled.
 *
 * @param existing - The degree's current-term catalog.
 * @returns A compact list, or a line saying there is none.
 */
function renderCatalog(existing: ExistingCourse[]): string {
  if (existing.length === 0) {
    return 'EXISTING COURSES: none. Every course you find is new.';
  }

  const lines = existing.map(
    (course) => `- id=${course.courseId} | ${course.code} | ${course.name}`,
  );

  return `EXISTING COURSES (the only ids you may use):\n${lines.join('\n')}`;
}

/**
 * Builds the user turn.
 *
 * The file goes FIRST and the instructions after it. Both orders work, but a
 * document ahead of its question is the arrangement the provider documents, and
 * it keeps the catalog — the longest part — next to the task that uses it.
 *
 * @param input      - What the student supplied.
 * @param degreeName - Named so the model can judge whether a course is plausible.
 * @param existing   - The degree's catalog.
 * @returns Content blocks for the request.
 */
function buildUserTurn(
  input: ExtractionInput,
  degreeName: string,
  existing: ExistingCourse[],
): AiContentBlock[] {
  const catalog = renderCatalog(existing);

  if (input.kind === 'text') {
    return [
      {
        type: 'text',
        text: `Degree: ${degreeName}

${catalog}

The student typed this as a course they are taking:

"""
${input.text}
"""

Report it as a single entry.`,
      },
    ];
  }

  const file: AiContentBlock =
    input.mediaType === 'application/pdf'
      ? {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: input.data },
        }
      : {
          type: 'image',
          source: { type: 'base64', media_type: input.mediaType, data: input.data },
        };

  return [
    file,
    {
      type: 'text',
      text: `Degree: ${degreeName}

${catalog}

The attached file is this student's university timetable or syllabus. Extract
every academic course it lists.`,
    },
  ];
}

/**
 * Re-checks the model's matching claims against the catalog it was given.
 *
 * A model asked to return an id from a list will sometimes return an id that
 * looks like one. Anything not found is demoted to a new course rather than
 * dropped, because the course itself may well be real even when the match is not.
 *
 * @param courses  - Schema-valid but unverified entries.
 * @param existing - The catalog that was sent.
 * @returns Entries whose `existingCourseId` is real.
 */
function verifyMatches(
  courses: ExtractedCourse[],
  existing: ExistingCourse[],
): ExtractedCourse[] {
  const known = new Set(existing.map((course) => course.courseId));

  return courses.map((course) => {
    if (!course.existingCourseId || known.has(course.existingCourseId)) {
      return course;
    }

    console.warn('[courses.extract] model returned an unknown course id; demoting');

    return {
      ...course,
      isDuplicate: false,
      existingCourseId: null,
      reason: 'Not in the catalog yet — you can still add it.',
    };
  });
}

/**
 * Runs the extraction agent.
 *
 * @param options - The student's input, their degree, and its catalog.
 * @returns Verified entries, or the reason there are none.
 */
export async function extractCourses(options: {
  input: ExtractionInput;
  degreeName: string;
  existing: ExistingCourse[];
}): Promise<ExtractionOutcome> {
  const result = await completeJson({
    system: SYSTEM_PROMPT,
    user: buildUserTurn(options.input, options.degreeName, options.existing),
    /*
     * Room for a full timetable, and for the thinking that some models do by
     * default — max_tokens caps both together, so a tight budget would truncate
     * the JSON rather than the reasoning.
     */
    maxTokens: 8192,
    /* A page of vision takes longer than the text calls this default was set for. */
    timeoutMs: options.input.kind === 'file' ? 90_000 : 30_000,
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason === 'not_configured' ? 'not_configured' : 'request_failed',
    };
  }

  const parsed = extractionSchema.safeParse(extractJson(result.text));

  if (!parsed.success) {
    console.error(
      '[courses.extract] reply failed validation:',
      parsed.error.issues[0]?.message,
    );
    return { ok: false, reason: 'invalid_output' };
  }

  return {
    ok: true,
    courses: verifyMatches(parsed.data.extractedCourses, options.existing),
    model: result.model,
    latencyMs: result.latencyMs,
  };
}

