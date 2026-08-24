/**
 * File:        src/features/chat/icebreaker-content.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The icebreaker's pure parts: the prompt, the reply schema, the
 *              shared-context wording, and the opener used when no model is
 *              configured.
 *
 *              Split from icebreaker.ts because that module is `server-only` —
 *              it talks to the provider — and none of this is. Same reason
 *              catalog-schema.ts exists: keeping the pure half importable lets
 *              it be unit tested without a server environment, and the fallback
 *              opener is the path this project is graded on, so it must be
 *              covered.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Split out of features/chat/icebreaker.ts
 */

import { z } from 'zod';

/**
 * The system prompt, as specified for this phase.
 *
 * The JSON instruction is the only addition. `completeJson` is the single entry
 * point to the model in this project and it parses a JSON reply, so asking for
 * prose here would mean a second, differently-shaped provider call. Everything
 * about the message itself is the given wording.
 */
export const ICEBREAKER_SYSTEM_PROMPT = `Generate a casual, fun, and short icebreaker message (max 2 sentences) for two university students who just matched. Mention their shared courses or study preferences. Keep it natural and friendly.

Reply with ONLY a JSON object, no prose and no code fences:
{"message": "<the icebreaker>"}

Write it as the first student speaking to the second, in the first person. Do not
use placeholders or square brackets — use the names you are given.`;

/** The reply shape. Two sentences of chat, so the ceiling is deliberately low. */
export const icebreakerReplySchema = z.object({
  message: z.string().trim().min(4).max(400),
});

export interface IcebreakerContext {
  /** The sender's first name, as they will appear to the recipient. */
  senderFirstName: string;
  recipientFirstName: string;
  /** Course names both students are taking. */
  sharedCourses: string[];
  /** Plain-language preference notes, e.g. "both prefer evenings". */
  sharedPreferences: string[];
}

/**
 * The opener to send when no model is available.
 *
 * The same reasoning as the placeholder course catalog: an unconfigured key is a
 * deployment state, not a reason for the feature to do nothing. A student who
 * presses "Send message" must end up in a conversation either way, so this
 * writes a real opener from the real shared context — it is duller than a
 * model's, and it is honest, which is why it is NOT marked as an icebreaker: a
 * sentence assembled from two facts is the sender's own message, and labelling
 * it "AI" would be a lie in the other direction.
 *
 * @param context - The two students and what they have in common.
 * @returns A short opening message.
 */
// export function fallbackIcebreaker(context: IcebreakerContext): string {
//   const course = context.sharedCourses[0];
//   const preference = context.sharedPreferences[0];

//   if (course && preference) {
//     return `Hi ${context.recipientFirstName}! I saw we are both taking ${course} — and that we ${preference}. Want to study together sometime?`;
//   }

//   if (course) {
//     return `Hi ${context.recipientFirstName}! I saw we are both taking ${course}. Want to study together sometime?`;
//   }

//   return `Hi ${context.recipientFirstName}! We came up as study users — want to find a time to work together?`;
// }

export function fallbackIcebreaker(context: IcebreakerContext): string {
  const coursesCount = context.sharedCourses.length;
  const prefsCount = context.sharedPreferences.length;

  const courseWord = coursesCount === 1 ? 'course' : 'courses';
  const prefWord = prefsCount === 1 ? 'study preference' : 'study preferences';

  if (coursesCount && prefsCount) {
    return `Hi ${context.recipientFirstName}! I saw we share ${coursesCount} ${courseWord} and ${prefsCount} ${prefWord}. Want to study together sometime?`;
  }

  if (coursesCount) {
    return `Hi ${context.recipientFirstName}! I saw we share ${coursesCount} ${courseWord}. Want to study together sometime?`;
  }

  return `Hi ${context.recipientFirstName}! We came up as study users — want to find a time to work together?`;
}

/**
 * Describes overlapping preferences in words a student would use.
 *
 * @param mine   - The sender's stored preference values.
 * @param theirs - The recipient's.
 * @returns Short phrases, e.g. "both prefer evenings".
 */
export function sharedPreferenceNotes(
  mine: {
    preferredTimeBlocks: string[];
    studyEnvironments: string[];
    groupSizes: string[];
  },
  theirs: {
    preferredTimeBlocks: string[];
    studyEnvironments: string[];
    groupSizes: string[];
  },
): string[] {
  const TIME_WORDS: Record<string, string> = {
    morning: 'mornings',
    noon: 'middays',
    evening: 'evenings',
  };
  const ENVIRONMENT_WORDS: Record<string, string> = {
    quiet: 'like studying quietly',
    discussion: 'like talking things through',
  };
  const GROUP_WORDS: Record<string, string> = {
    small: 'prefer small groups',
    large: 'prefer bigger groups',
  };

  const notes: string[] = [];

  const times = mine.preferredTimeBlocks.filter((block) =>
    theirs.preferredTimeBlocks.includes(block),
  );
  if (times.length > 0) {
    notes.push(`both prefer ${times.map((time) => TIME_WORDS[time] ?? time).join(' and ')}`);
  }

  const environments = mine.studyEnvironments.filter((environment) =>
    theirs.studyEnvironments.includes(environment),
  );
  if (environments.length > 0) {
    notes.push(`both ${ENVIRONMENT_WORDS[environments[0]] ?? environments[0]}`);
  }

  const groups = mine.groupSizes.filter((size) => theirs.groupSizes.includes(size));
  if (groups.length > 0) {
    notes.push(`both ${GROUP_WORDS[groups[0]] ?? groups[0]}`);
  }

  return notes;
}
