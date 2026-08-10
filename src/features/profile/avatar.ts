/**
 * File:        src/features/profile/avatar.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Uploading a profile photo to Storage.
 *
 *              Extracted from the onboarding action rather than copied, because
 *              the Profile tab now uploads the same way. Two copies of an upload
 *              that fails SILENTLY on a rejected file would be two places for
 *              that behaviour to drift, and the drift would be invisible — the
 *              student would just not get a photo.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - Extracted from features/onboarding/actions.ts
 */

import 'server-only';

import type { createClient } from '@/lib/supabase/server';

/** Mirrors the storage bucket's own limit, so an oversize file fails early. */
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Uploads a profile photo and returns its public URL.
 *
 * Written to a folder named after the student's own uuid, which is exactly what
 * the storage policy checks — a student cannot write outside their own folder, so
 * one photo can never overwrite another's.
 *
 * @param supabase - The request-scoped client, so the upload runs as the student.
 * @param userId   - The owner's id, used as the folder name.
 * @param file     - The uploaded file.
 * @returns The public URL, or null when there is nothing valid to upload.
 */
export async function uploadAvatar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  file: File | null,
): Promise<string | null> {
  if (!file || file.size === 0) {
    return null;
  }

  if (!ALLOWED_AVATAR_TYPES.includes(file.type) || file.size > MAX_AVATAR_BYTES) {
    return null;
  }

  const extension = file.type.split('/')[1].replace('jpeg', 'jpg');
  /* Timestamped so a replacement gets a fresh URL rather than a cached old image. */
  const path = `${userId}/avatar-${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, file, { contentType: file.type, upsert: true });

  if (error) {
    return null;
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}
