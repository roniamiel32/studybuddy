/**
 * File:        src/features/wall/actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The write side of the social wall.
 *
 *              Both actions run as the signed-in student, so the Phase 8B
 *              policies do the authorisation: posting needs a connection,
 *              removing needs to be the author or the wall's owner. Nothing here
 *              re-decides either rule — it only turns a refusal into a sentence.
 * Version:     0.20.0
 *
 * Modifications:
 *     0.21.0 - 2026-08-12 - Likes, comments, editing and sharing (Phase 8C)
 *     0.20.0 - 2026-08-11 - Initial implementation (Phase 8B)
 */

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { createClient, requireUser } from '@/lib/supabase/server';

const createPostSchema = z.object({
  profileOwnerId: z.uuid(),
  body: z
    .string()
    .trim()
    .min(1, 'Write something first.')
    .max(1000, 'Keep it under 1000 characters.'),
});

const removePostSchema = z.object({ postId: z.uuid() });

const editPostSchema = z.object({
  postId: z.uuid(),
  profileOwnerId: z.uuid(),
  body: z
    .string()
    .trim()
    .min(1, 'A post cannot be empty.')
    .max(1000, 'Keep it under 1000 characters.'),
});

const likeSchema = z.object({ postId: z.uuid(), profileOwnerId: z.uuid() });

const commentSchema = z.object({
  postId: z.uuid(),
  profileOwnerId: z.uuid(),
  /** Present when this is a reply. Absent for a top-level comment. */
  parentCommentId: z.uuid().optional(),
  body: z
    .string()
    .trim()
    .min(1, 'Write something first.')
    .max(500, 'Keep it under 500 characters.'),
});

const shareSchema = z.object({
  postId: z.uuid(),
  /** Whose wall it is being shared onto — usually the sharer's own. */
  profileOwnerId: z.uuid(),
});

const removeCommentSchema = z.object({ commentId: z.uuid(), profileOwnerId: z.uuid() });

const commentLikeSchema = z.object({ commentId: z.uuid(), profileOwnerId: z.uuid() });

/**
 * Writes a post on someone's wall.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries the wall and the words.
 * @returns Success, or a failure the form can show.
 */
export async function createWallPost(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const input = createPostSchema.parse({
      profileOwnerId: String(formData.get('profileOwnerId') ?? ''),
      body: String(formData.get('body') ?? ''),
    });

    const { error } = await supabase.from('wall_posts').insert({
      profile_owner_id: input.profileOwnerId,
      author_id: user.id,
      body: input.body,
    });

    if (error) {
      /*
       * The connection rule is the only likely refusal, and it is worth naming:
       * a student who is told "we could not post that" will try again, and a
       * student who is told what earns the right will go and do it.
       */
      return fail(
        ERROR_CODES.FORBIDDEN,
        'You can only post on the wall of someone you have studied with.',
        'body',
      );
    }

    revalidatePath(`/students/${input.profileOwnerId}`);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'wall.createWallPost');
  }
}

/**
 * Removes a post.
 *
 * The author may take back their own words; the wall's owner may remove anything
 * from their own profile. Both are the delete policy's business, not this
 * function's — it reports what the database decided.
 *
 * @param input - Which post.
 * @returns Success, or a failure.
 */
export async function removeWallPost(input: {
  postId: string;
  profileOwnerId: string;
}): Promise<ActionResult<void>> {
  try {
    await requireUser();
    const parsed = removePostSchema.parse({ postId: input.postId });
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('wall_posts')
      .delete()
      .eq('id', parsed.postId)
      .select('id');

    if (error || (data ?? []).length === 0) {
      return fail(ERROR_CODES.FORBIDDEN, 'That post is not yours to remove.');
    }

    revalidatePath(`/students/${input.profileOwnerId}`);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'wall.removeWallPost');
  }
}

/**
 * Rewrites a post.
 *
 * Only the author, enforced by the update policy. The wall's owner may remove a
 * post from their profile but not rewrite it — removing is moderation, editing
 * would be putting words in someone's mouth.
 *
 * The "edited" marker is not set here and cannot be: is_edited is a generated
 * column over updated_at and created_at, so a post that changed says so whether
 * or not this function remembers to mention it.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries the post and the new words.
 * @returns Success, or a failure.
 */
export async function editWallPost(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    await requireUser();
    const supabase = await createClient();

    const input = editPostSchema.parse({
      postId: String(formData.get('postId') ?? ''),
      profileOwnerId: String(formData.get('profileOwnerId') ?? ''),
      body: String(formData.get('body') ?? ''),
    });

    const { data, error } = await supabase
      .from('wall_posts')
      .update({ body: input.body })
      .eq('id', input.postId)
      .select('id');

    if (error || (data ?? []).length === 0) {
      return fail(ERROR_CODES.FORBIDDEN, 'Only the author can edit a post.', 'body');
    }

    revalidatePath(`/students/${input.profileOwnerId}`);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'wall.editWallPost');
  }
}

/**
 * Likes a post, or takes the like back.
 *
 * A DELETE AND AN INSERT rather than a counter, because a like is a row: the
 * primary key on (post_id, profile_id) is what makes double-liking impossible,
 * and a stored total would be a second copy of something the rows already say.
 *
 * @param input - The post, and which wall it is on.
 * @returns Whether the post is now liked, or a failure.
 */
export async function togglePostLike(input: {
  postId: string;
  profileOwnerId: string;
}): Promise<ActionResult<{ liked: boolean }>> {
  try {
    const user = await requireUser();
    const parsed = likeSchema.parse(input);
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from('post_likes')
      .select('post_id')
      .eq('post_id', parsed.postId)
      .eq('profile_id', user.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('post_likes')
        .delete()
        .eq('post_id', parsed.postId)
        .eq('profile_id', user.id);

      if (error) {
        return fail(ERROR_CODES.UNEXPECTED, 'We could not update that.');
      }

      revalidatePath(`/students/${parsed.profileOwnerId}`);

      return ok({ liked: false });
    }

    const { error } = await supabase
      .from('post_likes')
      .insert({ post_id: parsed.postId, profile_id: user.id });

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, 'You cannot like a post you cannot see.');
    }

    revalidatePath(`/students/${parsed.profileOwnerId}`);

    return ok({ liked: true });
  } catch (error) {
    return toActionError(error, 'wall.togglePostLike');
  }
}

/**
 * Comments on a post.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries the post and the words.
 * @returns Success, or a failure.
 */
export async function createComment(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const input = commentSchema.parse({
      postId: String(formData.get('postId') ?? ''),
      profileOwnerId: String(formData.get('profileOwnerId') ?? ''),
      body: String(formData.get('body') ?? ''),
      parentCommentId: String(formData.get('parentCommentId') ?? '') || undefined,
    });

    const { error } = await supabase.from('post_comments').insert({
      post_id: input.postId,
      author_id: user.id,
      body: input.body,
      /*
       * ONE ACTION FOR BOTH, because a reply is a comment with a parent. Two
       * actions would duplicate the validation and the revalidation, and the
       * trigger that enforces "same post, one level deep" does not care which
       * one called it.
       */
      parent_comment_id: input.parentCommentId ?? null,
    });

    if (error) {
      /* The reply rules come back as constraint violations with a sentence
         already written for a person — pass those through rather than replacing
         them with a vaguer one. */
      if (error.message.includes('reply')) {
        return fail(ERROR_CODES.VALIDATION_FAILED, error.message, 'body');
      }

      return fail(
        ERROR_CODES.FORBIDDEN,
        'You cannot comment on a post you cannot see.',
        'body',
      );
    }

    revalidatePath(`/students/${input.profileOwnerId}`);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'wall.createComment');
  }
}

/**
 * Removes a comment.
 *
 * @param input - Which comment, and the wall to refresh.
 * @returns Success, or a failure.
 */
export async function removeComment(input: {
  commentId: string;
  profileOwnerId: string;
}): Promise<ActionResult<void>> {
  try {
    await requireUser();
    const parsed = removeCommentSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('post_comments')
      .delete()
      .eq('id', parsed.commentId)
      .select('id');

    if (error || (data ?? []).length === 0) {
      return fail(ERROR_CODES.FORBIDDEN, 'That comment is not yours to remove.');
    }

    revalidatePath(`/students/${parsed.profileOwnerId}`);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'wall.removeComment');
  }
}

/**
 * Shares a post onto the caller's own wall.
 *
 * WHO WILL SEE IT is not this function's decision and is worth knowing before
 * pressing the button: a shared post is visible only to people connected to BOTH
 * the sharer and the original author. Passing a post along must not widen the
 * audience for words someone wrote to a smaller one, so sharing something from a
 * classmate your own connections have never met shares it with nobody.
 *
 * @param input - The post to pass on.
 * @returns Success, or a failure.
 */
export async function shareWallPost(input: {
  postId: string;
}): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const parsed = shareSchema.parse({ postId: input.postId, profileOwnerId: user.id });
    const supabase = await createClient();

    const { error } = await supabase.from('wall_posts').insert({
      profile_owner_id: user.id,
      author_id: user.id,
      body: null,
      original_post_id: parsed.postId,
    });

    if (error) {
      if (error.message.includes('share of it')) {
        return fail(
          ERROR_CODES.VALIDATION_FAILED,
          'Share the original post rather than a share of it.',
        );
      }

      return fail(ERROR_CODES.FORBIDDEN, 'We could not share that post.');
    }

    revalidatePath(`/students/${user.id}`);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'wall.shareWallPost');
  }
}

/**
 * Likes a comment, or takes the like back.
 *
 * The same shape as togglePostLike, and for the same reason: a like is a row, so
 * the primary key on (comment_id, profile_id) is what makes double-liking
 * impossible. No counter to keep in step.
 *
 * @param input - The comment, and which wall to refresh.
 * @returns Whether the comment is now liked, or a failure.
 */
export async function toggleCommentLike(input: {
  commentId: string;
  profileOwnerId: string;
}): Promise<ActionResult<{ liked: boolean }>> {
  try {
    const user = await requireUser();
    const parsed = commentLikeSchema.parse(input);
    const supabase = await createClient();

    const { data: existing } = await supabase
      .from('comment_likes')
      .select('comment_id')
      .eq('comment_id', parsed.commentId)
      .eq('profile_id', user.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('comment_likes')
        .delete()
        .eq('comment_id', parsed.commentId)
        .eq('profile_id', user.id);

      if (error) {
        return fail(ERROR_CODES.UNEXPECTED, 'We could not update that.');
      }

      revalidatePath(`/students/${parsed.profileOwnerId}`);

      return ok({ liked: false });
    }

    const { error } = await supabase
      .from('comment_likes')
      .insert({ comment_id: parsed.commentId, profile_id: user.id });

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, 'You cannot like a comment you cannot see.');
    }

    revalidatePath(`/students/${parsed.profileOwnerId}`);

    return ok({ liked: true });
  } catch (error) {
    return toActionError(error, 'wall.toggleCommentLike');
  }
}
