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
