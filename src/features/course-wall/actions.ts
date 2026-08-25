/**
 * File:        src/features/course-wall/actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The write side of a course page — its wall, and its tips.
 *
 *              EVERY ACTION CARRIES THE OFFERING ID, and none of them trusts it.
 *              It is there to revalidate the right page, not to decide anything:
 *              enrolment is checked by RLS on the row being written, so a forged
 *              id changes which page gets refreshed and nothing else.
 *
 *              RATING IS AN UPSERT, which is the whole reason course_tip_ratings
 *              has a composite primary key. Changing your mind has to be an
 *              update of your own row rather than a second vote, or the average
 *              stops meaning anything the first time somebody wavers.
 * Version:     0.25.0
 *
 * Modifications:
 *     0.25.0 - 2026-08-13 - Initial implementation (Phase 9C)
 */

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { createClient, requireUser } from '@/lib/supabase/server';

const offeringIdSchema = z.uuid('That course does not look right.');

const postSchema = z.object({
  offeringId: offeringIdSchema,
  body: z
    .string()
    .trim()
    .min(1, 'Write something first.')
    .max(1000, 'Posts are limited to 1000 characters.'),
});

const commentSchema = z.object({
  offeringId: offeringIdSchema,
  postId: z.uuid(),
  body: z
    .string()
    .trim()
    .min(1, 'Write something first.')
    .max(500, 'Comments are limited to 500 characters.'),
  parentCommentId: z.uuid().optional(),
});

const tipSchema = z.object({
  offeringId: offeringIdSchema,
  body: z
    .string()
    .trim()
    .min(1, 'Write your tip first.')
    .max(1000, 'Tips are limited to 1000 characters.'),
});

const ratingSchema = z.object({
  tipId: z.uuid(),
  offeringId: offeringIdSchema,
  /* The bounds the CHECK constraint enforces, stated here so a bad value is a
     sentence rather than a constraint violation. */
  stars: z.coerce.number().int().min(1).max(5),
});

/**
 * The two pages a course change can be visible on.
 *
 * @param offeringId - Which course.
 * @returns Nothing.
 */
function revalidateCourse(offeringId: string): void {
  revalidatePath(`/courses/${offeringId}`);
  revalidatePath(`/courses/${offeringId}/tips`);
}

/**
 * Writes a post on a course wall.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries the course and the words.
 * @returns Success, or a failure.
 */
export async function createCoursePost(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const input = postSchema.parse({
      offeringId: String(formData.get('offeringId') ?? ''),
      body: String(formData.get('body') ?? ''),
    });

    const { error } = await supabase.from('course_posts').insert({
      course_offering_id: input.offeringId,
      author_id: user.id,
      body: input.body,
    });

    if (error) {
      /* RLS refused it, which for this table means one thing. */
      return fail(ERROR_CODES.FORBIDDEN, 'You can only post in a course you are taking.');
    }

    revalidateCourse(input.offeringId);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'courseWall.createCoursePost');
  }
}

/**
 * Removes a post you wrote.
 *
 * @param input - The post, and the course to revalidate.
 * @returns Success, or a failure.
 */
export async function removeCoursePost(input: {
  postId: string;
  offeringId: string;
}): Promise<ActionResult<void>> {
  try {
    await requireUser();
    const supabase = await createClient();
    const parsed = z.object({ postId: z.uuid(), offeringId: offeringIdSchema }).parse(input);

    const { error } = await supabase.from('course_posts').delete().eq('id', parsed.postId);

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, 'You can only remove a post you wrote.');
    }

    revalidateCourse(parsed.offeringId);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'courseWall.removeCoursePost');
  }
}

/**
 * Likes a course post, or takes the like back.
 *
 * A DELETE AND AN INSERT rather than a counter: the primary key on
 * (post_id, profile_id) is what makes double-liking impossible, and a stored
 * total would be a second copy of something the rows already say.
 *
 * @param input - The post, and the course to revalidate.
 * @returns Whether the post is now liked, or a failure.
 */
export async function toggleCoursePostLike(input: {
  postId: string;
  offeringId: string;
}): Promise<ActionResult<{ liked: boolean }>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const parsed = z.object({ postId: z.uuid(), offeringId: offeringIdSchema }).parse(input);

    const { data: existing } = await supabase
      .from('course_post_likes')
      .select('post_id')
      .eq('post_id', parsed.postId)
      .eq('profile_id', user.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('course_post_likes')
        .delete()
        .eq('post_id', parsed.postId)
        .eq('profile_id', user.id);

      if (error) {
        return fail(ERROR_CODES.UNEXPECTED, 'We could not update that.');
      }

      revalidateCourse(parsed.offeringId);

      return ok({ liked: false });
    }

    const { error } = await supabase
      .from('course_post_likes')
      .insert({ post_id: parsed.postId, profile_id: user.id });

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, 'You cannot like a post you cannot see.');
    }

    revalidateCourse(parsed.offeringId);

    return ok({ liked: true });
  } catch (error) {
    return toActionError(error, 'courseWall.toggleCoursePostLike');
  }
}

/**
 * Comments on a course post, or replies to a comment.
 *
 * ONE ACTION FOR BOTH, because a reply is a comment with a parent. The trigger
 * that enforces "same post, one level deep" does not care which one called it.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries the post, the words, and optionally a parent.
 * @returns Success, or a failure.
 */
export async function createCourseComment(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const input = commentSchema.parse({
      offeringId: String(formData.get('offeringId') ?? ''),
      postId: String(formData.get('postId') ?? ''),
      body: String(formData.get('body') ?? ''),
      parentCommentId: String(formData.get('parentCommentId') ?? '') || undefined,
    });

    const { error } = await supabase.from('course_post_comments').insert({
      post_id: input.postId,
      author_id: user.id,
      body: input.body,
      parent_comment_id: input.parentCommentId ?? null,
    });

    if (error) {
      /* The reply rules come back as constraint violations with a sentence
         already written for a person — pass those through rather than replacing
         them with a vaguer one. */
      if (error.message.includes('reply')) {
        return fail(ERROR_CODES.VALIDATION_FAILED, error.message, 'body');
      }

      return fail(ERROR_CODES.FORBIDDEN, 'You cannot comment on a post you cannot see.');
    }

    revalidateCourse(input.offeringId);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'courseWall.createCourseComment');
  }
}

/**
 * Removes a comment you wrote.
 *
 * @param input - The comment, and the course to revalidate.
 * @returns Success, or a failure.
 */
export async function removeCourseComment(input: {
  commentId: string;
  offeringId: string;
}): Promise<ActionResult<void>> {
  try {
    await requireUser();
    const supabase = await createClient();
    const parsed = z.object({ commentId: z.uuid(), offeringId: offeringIdSchema }).parse(input);

    const { error } = await supabase
      .from('course_post_comments')
      .delete()
      .eq('id', parsed.commentId);

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, 'You can only remove a comment you wrote.');
    }

    revalidateCourse(parsed.offeringId);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'courseWall.removeCourseComment');
  }
}

/**
 * Likes a comment on a course post, or takes the like back.
 *
 * @param input - The comment, and the course to revalidate.
 * @returns Whether the comment is now liked, or a failure.
 */
export async function toggleCourseCommentLike(input: {
  commentId: string;
  offeringId: string;
}): Promise<ActionResult<{ liked: boolean }>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const parsed = z.object({ commentId: z.uuid(), offeringId: offeringIdSchema }).parse(input);

    const { data: existing } = await supabase
      .from('course_comment_likes')
      .select('comment_id')
      .eq('comment_id', parsed.commentId)
      .eq('profile_id', user.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('course_comment_likes')
        .delete()
        .eq('comment_id', parsed.commentId)
        .eq('profile_id', user.id);

      if (error) {
        return fail(ERROR_CODES.UNEXPECTED, 'We could not update that.');
      }

      revalidateCourse(parsed.offeringId);

      return ok({ liked: false });
    }

    const { error } = await supabase
      .from('course_comment_likes')
      .insert({ comment_id: parsed.commentId, profile_id: user.id });

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, 'You cannot like a comment you cannot see.');
    }

    revalidateCourse(parsed.offeringId);

    return ok({ liked: true });
  } catch (error) {
    return toActionError(error, 'courseWall.toggleCourseCommentLike');
  }
}

/**
 * Writes a tip for a course.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries the course and the advice.
 * @returns Success, or a failure.
 */
export async function createCourseTip(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const input = tipSchema.parse({
      offeringId: String(formData.get('offeringId') ?? ''),
      body: String(formData.get('body') ?? ''),
    });

    const { error } = await supabase.from('course_tips').insert({
      course_offering_id: input.offeringId,
      author_id: user.id,
      body: input.body,
    });

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, 'You can only write a tip for a course you are taking.');
    }

    revalidateCourse(input.offeringId);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'courseWall.createCourseTip');
  }
}

/**
 * Removes a tip you wrote.
 *
 * @param input - The tip, and the course to revalidate.
 * @returns Success, or a failure.
 */
export async function removeCourseTip(input: {
  tipId: string;
  offeringId: string;
}): Promise<ActionResult<void>> {
  try {
    await requireUser();
    const supabase = await createClient();
    const parsed = z.object({ tipId: z.uuid(), offeringId: offeringIdSchema }).parse(input);

    const { error } = await supabase.from('course_tips').delete().eq('id', parsed.tipId);

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, 'You can only remove a tip you wrote.');
    }

    revalidateCourse(parsed.offeringId);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'courseWall.removeCourseTip');
  }
}

/**
 * Rates a tip from one to five stars, or changes a rating already given.
 *
 * AN UPSERT ON THE COMPOSITE KEY. Pressing four stars after three has to replace
 * the three rather than add a fourth vote, and letting the primary key decide
 * that means there is no read-then-write window for two quick presses to race
 * through.
 *
 * @param input - The tip, the course, and how many stars.
 * @returns The stars now recorded, or a failure.
 */
export async function rateCourseTip(input: {
  tipId: string;
  offeringId: string;
  stars: number;
}): Promise<ActionResult<{ stars: number }>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();
    const parsed = ratingSchema.parse(input);

    const { error } = await supabase
      .from('course_tip_ratings')
      .upsert(
        { tip_id: parsed.tipId, profile_id: user.id, stars: parsed.stars },
        { onConflict: 'tip_id,profile_id' },
      );

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, 'You can only rate a tip in a course you are taking.');
    }

    revalidateCourse(parsed.offeringId);

    return ok({ stars: parsed.stars });
  } catch (error) {
    return toActionError(error, 'courseWall.rateCourseTip');
  }
}
