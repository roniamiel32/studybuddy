/**
 * File:        src/features/profiles/actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Rating a study partner, and withdrawing a rating.
 *
 *              Both write as the signed-in student, so the ratings policies decide
 *              who may rate whom. This file does not re-check the conversation
 *              requirement or the ownership rule — a hand-written copy of either
 *              would be free to drift from the policy that actually protects the
 *              row.
 *
 *              WHAT THIS FILE MUST NEVER DO is tell anyone about a negative rating
 *              other than its author. There is no notification on a negative
 *              rating, no revalidation of the rated student's screens, and nothing
 *              in the returned result that distinguishes one from the other.
 * Version:     0.18.0
 *
 * Modifications:
 *     0.18.0 - 2026-08-10 - Initial implementation (Phase 6)
 */

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { createClient, requireUser } from '@/lib/supabase/server';

const rateSchema = z.object({
  rateeId: z.uuid('That student does not exist.'),
  sentiment: z.enum(['positive', 'negative']),
  note: z.string().trim().max(500, 'Keep the note under 500 characters.').optional(),
  courseOfferingId: z.uuid().optional(),
});

const withdrawSchema = z.object({ rateeId: z.uuid() });

/**
 * Records how a study session went.
 *
 * Positive is public on the rated student's profile and raises their score with
 * everyone. Negative is private to the rater and removes the pair from each
 * other's candidates. Both are upserted, so changing your mind replaces your
 * previous answer rather than adding a second one.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `rateeId`, `sentiment`, and optionally `note` and
 *                   `courseOfferingId`.
 * @returns Success, or a failure the dialog can display.
 */
export async function rateStudyPartner(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const input = rateSchema.parse({
      rateeId: String(formData.get('rateeId') ?? ''),
      sentiment: String(formData.get('sentiment') ?? ''),
      note: formData.get('note') ? String(formData.get('note')) : undefined,
      courseOfferingId: formData.get('courseOfferingId')
        ? String(formData.get('courseOfferingId'))
        : undefined,
    });

    if (input.rateeId === user.id) {
      return fail(ERROR_CODES.VALIDATION_FAILED, 'You cannot rate yourself.');
    }

    const { error } = await supabase.from('study_ratings').upsert(
      {
        rater_id: user.id,
        ratee_id: input.rateeId,
        sentiment: input.sentiment,
        note: input.note ? input.note : null,
        course_offering_id: input.courseOfferingId ?? null,
      },
      { onConflict: 'rater_id,ratee_id' },
    );

    if (error) {
      /*
       * The insert policy requires a conversation with this person, which is the
       * likely cause. Named plainly rather than as a permission error, because from
       * the student's side it is a sequencing problem, not a refusal.
       */
      return fail(
        ERROR_CODES.FORBIDDEN,
        'You can only rate someone you have talked to on StudyBuddy.',
        'sentiment',
      );
    }

    /*
     * Revalidate the rated student's profile and the viewer's own matches, because
     * both change: a positive rating adds a public connection and raises their
     * score, and a negative one removes the pair from each other's candidates.
     *
     * Note what is NOT here: no notification, and nothing that would surface a
     * negative rating to the person it is about.
     */
    revalidatePath(`/students/${input.rateeId}`);
    revalidatePath('/dashboard');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'profiles.rateStudyPartner');
  }
}

/**
 * Withdraws a rating the caller gave.
 *
 * Deleting is allowed rather than only flipping to positive: someone who rated in
 * frustration should be able to take it back, and forcing them to record a positive
 * they do not mean would corrupt both the profile and the matching signal.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `rateeId`.
 * @returns Success, or a failure.
 */
export async function withdrawRating(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const { rateeId } = withdrawSchema.parse({
      rateeId: String(formData.get('rateeId') ?? ''),
    });

    const { error } = await supabase
      .from('study_ratings')
      .delete()
      .eq('rater_id', user.id)
      .eq('ratee_id', rateeId);

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, 'We could not withdraw that rating.');
    }

    revalidatePath(`/students/${rateeId}`);
    revalidatePath('/dashboard');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'profiles.withdrawRating');
  }
}

const blockSchema = z.object({ profileId: z.uuid('That student does not exist.') });

/**
 * Blocks another student, which is the hard exclusion.
 *
 * BLOCKING AND RATING BADLY ARE DIFFERENT ACTS, and since matching v5 they are
 * finally different mechanisms. A negative rating is feedback: private, and
 * worth a 0.75x demotion in the ranking. A block is refusal — it removes the
 * pair from each other's candidates entirely, in both directions, and it is the
 * only thing that still does. That is why this control exists: softening the
 * rating penalty left students with no way to say "not this person", and a
 * ranking adjustment is not an answer to somebody you do not want to be shown.
 *
 * SYMMETRIC BY THE SCORER, NOT BY THIS ROW. One row is written, naming who
 * blocked whom. rpc_find_candidates then tests it in both directions, so the
 * blocked student stops seeing the blocker too — without being told, and without
 * a second row that would let them discover it by reading their own list.
 *
 * @param input - Who to block.
 * @returns Success, or a failure.
 */
export async function blockStudent(input: { profileId: string }): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const { profileId } = blockSchema.parse(input);
    const supabase = await createClient();

    if (profileId === user.id) {
      return fail(ERROR_CODES.VALIDATION_FAILED, 'You cannot block yourself.');
    }

    const { error } = await supabase
      .from('blocked_users')
      /* Blocking twice is blocking once, not an error to show somebody. */
      .upsert(
        { blocker_id: user.id, blocked_id: profileId },
        { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true },
      );

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, 'We could not block that student. Try again.');
    }

    /*
     * The dashboard and every course page rank candidates, so all of them are
     * now out of date. The blocked student's own profile is revalidated too —
     * the viewer is being sent away from it, and it should not be served from a
     * cache that still offers to message them.
     */
    revalidatePath(`/students/${profileId}`);
    revalidatePath('/dashboard');
    revalidatePath('/courses', 'layout');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'profiles.blockStudent');
  }
}

/**
 * Lifts a block the caller placed.
 *
 * @param input - Who to unblock.
 * @returns Success, or a failure.
 */
export async function unblockStudent(input: { profileId: string }): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const { profileId } = blockSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase
      .from('blocked_users')
      .delete()
      .eq('blocker_id', user.id)
      .eq('blocked_id', profileId);

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, 'We could not lift that block. Try again.');
    }

    revalidatePath(`/students/${profileId}`);
    revalidatePath('/dashboard');
    revalidatePath('/courses', 'layout');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'profiles.unblockStudent');
  }
}
