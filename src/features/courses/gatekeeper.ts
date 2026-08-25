/**
 * File:        src/features/courses/gatekeeper.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The course gatekeeper. A student types a course name; this decides
 *              whether the catalog already has it under different wording, and
 *              whether what they typed is shaped like a course at all.
 *
 *              PURE TYPESCRIPT. No model, no network, no key. Everything here is
 *              string comparison, so it runs in a test, on a laptop with no
 *              internet, and in the same millisecond every time.
 *
 *              WHAT IT CAN AND CANNOT DO. It resolves wording — case, spacing,
 *              punctuation, common abbreviations, acronyms, and small typos. It
 *              CANNOT tell you whether "Advanced Underwater Basket Weaving" is a
 *              real course, because nothing in this file knows anything about
 *              universities. For a name it cannot match, `isValid` is a check on
 *              the SHAPE of the string — long enough, has letters, is not a room
 *              number or a lunch break — and the wording it returns says so
 *              rather than implying somebody verified it.
 *
 *              THE DIGIT RULE IS THE IMPORTANT ONE. "Calculus 1" and "Calculus 2"
 *              are one character apart, which every fuzzy matcher in existence
 *              will happily call a typo. They are different courses, and merging
 *              them would put two cohorts in one room and match nobody correctly.
 *              Every fuzzy tier below refuses a candidate whose digits disagree
 *              with the input's.
 * Version:     0.44.0
 *
 * Modifications:
 *     0.44.0 - 2026-08-18 - Rewritten as a local matcher; the LLM agent, its
 *                           prompt and its rate limiting are gone
 *     0.43.0 - 2026-08-17 - Initial implementation (LLM gatekeeper)
 */

import { z } from 'zod';

/** Longest course name a student may submit. */
export const MAX_COURSE_NAME = 160;

/**
 * The gatekeeper's verdict.
 *
 * Kept as a schema even though a local function produces it: it is the written
 * contract between this module and the action, and the tests assert against it
 * so the shape cannot drift by accident.
 *
 * `year` is always null now. It stays in the shape because the field is part of
 * the agreed structure and because a catalog import could fill it later — but
 * nothing here can estimate an academic year, and returning a guess would be
 * inventing data.
 */
export const gatekeeperReplySchema = z.object({
  isValid: z.boolean(),
  isNew: z.boolean(),
  matchedCourseName: z.string().trim().max(MAX_COURSE_NAME).nullable(),
  year: z.number().int().min(1).max(4).nullable(),
  message: z.string().trim().min(1).max(300),
});

export type GatekeeperReply = z.infer<typeof gatekeeperReplySchema>;

/** One course already in the degree's catalog. */
export interface ExistingCourse {
  courseId: string;
  code: string;
  name: string;
  /** The offering a student actually enrols in; null when not offered this term. */
  offeringId: string | null;
}

/**
 * Words that carry no identity in a course name.
 *
 * Dropped before building an acronym, so "Introduction to Computer Science"
 * yields ICS rather than ITCS — which is what a student would actually type.
 */
const STOPWORDS = new Set(['to', 'of', 'and', 'the', 'in', 'for', 'a', 'an', 'on', 'with']);

/**
 * Abbreviations students actually type, and what they stand for.
 *
 * Deliberately short and boring. Every entry is a guess about a human habit, and
 * a wrong guess here silently matches the wrong course — so this holds only the
 * forms that are unambiguous in a university course list.
 */
const ABBREVIATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bintro\b/g, 'introduction'],
  [/\bmaths?\b/g, 'mathematics'],
  [/\bstats\b/g, 'statistics'],
  [/\bprob\b/g, 'probability'],
  [/\bcalc\b/g, 'calculus'],
  [/\blin\s*alg\b/g, 'linear algebra'],
  [/\balgo(rithm)?s?\b/g, 'algorithms'],
  [/\bds\b/g, 'data structures'],
  [/\bos\b/g, 'operating systems'],
  [/\bdb\b/g, 'database'],
  [/\bml\b/g, 'machine learning'],
  [/\bai\b/g, 'artificial intelligence'],
  [/\bse\b/g, 'software engineering'],
  [/\bcs\b/g, 'computer science'],
  [/\bocp\b/g, 'object oriented programming'],
  [/\boop\b/g, 'object oriented programming'],
];

/** Things a student types that are plainly not a course. */
const NOT_A_COURSE = [
  /^(hi|hey|hello|test|testing|none|n\/a|na|idk|\?+)$/,
  /* Keyboard mashing: a home-row run, repeated or not. */
  /^(asdf|qwer|zxcv|hjkl|jkl|qwerty|abcd)+$/,
  /^(lunch|break|free|free period|gap|recess)\b/,
  /^(room|hall|building|floor|bldg)\b/,
  /^(semester|term|year)\s*\d*$/,
];

/**
 * Reduces a string to comparable characters.
 *
 * Lowercase, and everything that is not a letter or digit removed — so "CS-101",
 * "cs 101" and "CS101" collapse to one key. Digits are KEPT: they are the only
 * thing separating "Calculus 1" from "Calculus 2". Hebrew is kept alongside
 * Latin, because a course list at an Israeli university is routinely half in each.
 *
 * @param value - A course name or code.
 * @returns The comparison key.
 */
export function comparisonKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9֐-׿]/g, '');
}

/**
 * Splits a name into lowercase words, with abbreviations expanded.
 *
 * @param value - A course name.
 * @returns Its words, in order.
 */
function tokens(value: string): string[] {
  let text = value.toLowerCase().replace(/[^a-z0-9֐-׿]+/g, ' ');

  for (const [pattern, expansion] of ABBREVIATIONS) {
    text = text.replace(pattern, expansion);
  }

  return text.split(' ').filter(Boolean);
}

/**
 * The digits in a string, in order.
 *
 * @param value - A course name.
 * @returns Its digits, concatenated.
 */
function digits(value: string): string {
  return (value.match(/\d/g) ?? []).join('');
}

/**
 * The acronym a student would type for a course name.
 *
 * @param value - A course name.
 * @returns Its initials, stopwords dropped.
 */
function acronym(value: string): string {
  return tokens(value)
    .filter((token) => !STOPWORDS.has(token))
    .map((token) => token[0])
    .join('');
}

/**
 * Levenshtein edit distance, capped for early exit.
 *
 * Two rolling rows rather than a full matrix: the inputs are course names, so
 * the matrix would be tiny either way, but there is no reason to allocate it.
 *
 * @param a   - First string.
 * @param b   - Second string.
 * @param max - Stop once the distance is known to exceed this.
 * @returns The distance, or `max + 1` once it is certain to be larger.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) {
    return 0;
  }

  if (Math.abs(a.length - b.length) > max) {
    return max + 1;
  }

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowBest = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
      current.push(value);
      rowBest = Math.min(rowBest, value);
    }

    /* Every remaining row can only grow, so this row's best is a lower bound. */
    if (rowBest > max) {
      return max + 1;
    }

    previous = current;
  }

  return previous[b.length];
}

/**
 * How far apart two keys may be and still be the same course.
 *
 * Scaled to length, because one wrong letter in a four-character name is a
 * different course while one wrong letter in a thirty-character name is a
 * fingerslip. Anything under four characters must match exactly.
 *
 * @param length - The typed key's length.
 * @returns The largest distance still considered a typo.
 */
function typoAllowance(length: number): number {
  if (length < 4) return 0;
  if (length < 8) return 1;
  if (length < 16) return 2;
  return 3;
}

/**
 * Whether two names disagree about their numbers.
 *
 * "Calculus 1" and "Calculus 2" are one edit apart and are not the same course.
 * A student who names a number gets exactly that course or nothing.
 *
 * ASYMMETRIC ON PURPOSE. The guard only fires when the STUDENT typed a digit. A
 * student who types "Calculus" has not asked for the wrong one — they have been
 * vague, and the right answer is to notice that both Calculus 1 and Calculus 2
 * fit and ask which. Blocking those candidates too would leave the input
 * matching nothing at all, and "no match" means "create a new course" — so the
 * strict version of this rule quietly created a third, numberless Calculus.
 *
 * @param typed     - What the student wrote.
 * @param candidate - The catalog course under consideration.
 * @returns True when the numbers rule this candidate out.
 */
function digitsConflict(typed: string, candidate: string): boolean {
  const typedDigits = digits(typed);

  return typedDigits.length > 0 && typedDigits !== digits(candidate);
}

/** How a candidate was reached, best first. Lower sorts earlier. */
const enum Tier {
  Exact = 0,
  Acronym = 1,
  Contained = 2,
  Typo = 3,
}

interface Candidate {
  course: ExistingCourse;
  tier: Tier;
  /** Tie-break within a tier: smaller is closer. */
  distance: number;
}

/**
 * Finds every catalog course the input could plausibly mean.
 *
 * @param text     - What the student typed.
 * @param existing - The degree's catalog.
 * @returns Candidates, best tier first.
 */
function candidatesFor(text: string, existing: ExistingCourse[]): Candidate[] {
  const typedKey = comparisonKey(text);
  const typedTokens = tokens(text);
  const typedExpandedKey = typedTokens.join('');
  const found: Candidate[] = [];

  for (const course of existing) {
    const nameKey = comparisonKey(course.name);
    const codeKey = comparisonKey(course.code);

    /* Exact. Digits are part of the key, so no separate guard is needed. */
    if (typedKey === nameKey || typedKey === codeKey || typedExpandedKey === nameKey) {
      found.push({ course, tier: Tier.Exact, distance: 0 });
      continue;
    }

    if (digitsConflict(text, course.name)) {
      continue;
    }

    /* An acronym the student typed for this course's name. */
    if (typedKey.length >= 2 && typedKey === acronym(course.name)) {
      found.push({ course, tier: Tier.Acronym, distance: 0 });
      continue;
    }

    /*
     * One name contains the other, once abbreviations are expanded. Guarded by
     * length: a three-letter fragment is inside half a catalog.
     */
    const courseExpandedKey = tokens(course.name).join('');
    const shorter = Math.min(typedExpandedKey.length, courseExpandedKey.length);

    if (
      shorter >= 5 &&
      (courseExpandedKey.includes(typedExpandedKey) ||
        typedExpandedKey.includes(courseExpandedKey))
    ) {
      found.push({
        course,
        tier: Tier.Contained,
        distance: Math.abs(typedExpandedKey.length - courseExpandedKey.length),
      });
      continue;
    }

    /* A typo, measured against the expanded forms. */
    const allowance = typoAllowance(typedExpandedKey.length);

    if (allowance > 0) {
      const distance = editDistance(typedExpandedKey, courseExpandedKey, allowance);

      if (distance <= allowance) {
        found.push({ course, tier: Tier.Typo, distance });
      }
    }
  }

  return found.sort((a, b) => a.tier - b.tier || a.distance - b.distance);
}

/**
 * Words commonly found in valid academic course names.
 * Used as a strict whitelist to prevent spam inputs like "hello world" or "low".
 */
const ACADEMIC_DICTIONARY = [
  // English Academic Terms
  'introduction', 'intro', 'advanced', 'programming', 'systems', 'theory',
  'data', 'engineering', 'law', 'seminar', 'science', 'history',
  'mathematics', 'math', 'physics', 'calculus', 'algebra', 'algorithms',
  'computer', 'business', 'management', 'psychology', 'philosophy',
  'economics', 'microeconomics', 'finance', 'statistics', 'ethics', 'learning',
  'english', 'logic', 'structures', 'digital', 'architecture', 'architectures',
  'probability', 'fundamentals', 'operating', 'computational', 'models',
  'machine', 'computability', 'complexity', 'networks', 'deep', 'graphics',
  'software', 'artificial', 'intelligence', 'principles', 'israeli',
  
  // Hebrew Academic Terms
  'מבוא', 'סמינר', 'תכנות', 'מערכות', 'תיאוריה', 'נתונים', 'הנדסה',
  'משפטים', 'מדע', 'היסטוריה', 'מתמטיקה', 'פיזיקה', 'חדוא', 'חדו"א', 'אלגברה',
  'אלגוריתמים', 'מחשבים', 'עסקים', 'ניהול', 'פסיכולוגיה', 'פילוסופיה',
  'כלכלה', 'מימון', 'סטטיסטיקה', 'אתיקה', 'למידה', 'אנגלית', 'לוגיקה',
  'מבני', 'דיגיטליות', 'הסתברות', 'מודלים', 'חישוביות', 'סיבוכיות',
  'רשתות', 'גרפיקה', 'מלאכותית', 'עקרונות'
];

/**
 * Whether a string is shaped like a course name.
 *
 * A SHAPE CHECK, NOT A FACT CHECK. It rejects the things that are obviously not
 * courses — a room number, a lunch break, a greeting, a keyboard mash — and
 * accepts everything else, provided it meets minimum length and contains at
 * least one recognized academic keyword.
 *
 * @param text - What the student typed.
 * @returns True when it could be a course name.
 */
function looksLikeCourseName(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  const key = comparisonKey(text);

  /* Rule 1: Must be at least 5 characters long and contain letters. */
  if (trimmed.length < 5 || !/[a-z֐-׿]/.test(key)) {
    return false;
  }

  /* Rule 2: A full paragraph is not a course name. */
  if (tokens(text).length > 12) {
    return false;
  }

  /* Rule 3: Latin words need a vowel; Hebrew has none to require. */
  if (!/[֐-׿]/.test(key) && !/[aeiouy]/.test(key)) {
    return false;
  }

  /* Rule 4: Hardcoded blocklist (greetings, keys mashing). */
  if (NOT_A_COURSE.some((pattern) => pattern.test(trimmed))) {
    return false;
  }

  /* Rule 5: MUST contain at least one word from the academic dictionary. */
  const hasAcademicWord = ACADEMIC_DICTIONARY.some((word) => 
    trimmed.includes(word)
  );

  return hasAcademicWord;
}

/**
 * Runs the gatekeeper.
 *
 * @param text     - What the student typed.
 * @param existing - The degree's catalog.
 * @returns The verdict, in the agreed shape.
 */
export function runGatekeeper(text: string, existing: ExistingCourse[]): GatekeeperReply {
  const candidates = candidatesFor(text, existing);
  const best = candidates[0];

  if (best) {
    /*
     * More than one course reached on equal terms — "algebra" against a catalog
     * holding Linear Algebra 1 and 2. Picking one would be a coin flip that
     * enrols somebody in the wrong course, so the student is asked instead.
     */
    const equallyGood = candidates.filter(
      (candidate) => candidate.tier === best.tier && candidate.distance === best.distance,
    );

    if (equallyGood.length > 1) {
      const names = equallyGood
        .slice(0, 3)
        .map((candidate) => candidate.course.name)
        .join(', ');

      return {
        isValid: false,
        isNew: false,
        matchedCourseName: null,
        year: null,
        message: `That could be ${names}. Type the full name of the one you mean.`,
      };
    }

    return {
      isValid: true,
      isNew: false,
      matchedCourseName: best.course.name,
      year: null,
      message:
        best.tier === Tier.Exact
          ? `${best.course.name} is already in your degree’s course list.`
          : `Matched to ${best.course.name}, already in your degree’s course list.`,
    };
  }

  if (!looksLikeCourseName(text)) {
    return {
      isValid: false,
      isNew: false,
      matchedCourseName: null,
      year: null,
      message: 'That does not look like a course name. Try the full name of the course.',
    };
  }

  return {
    isValid: true,
    isNew: true,
    matchedCourseName: null,
    year: null,
    message: `Added ${text.trim()} to your degree. Nobody has checked it against the syllabus yet.`,
  };
}
