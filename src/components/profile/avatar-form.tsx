/**
 * File:        src/components/profile/avatar-form.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The profile photo section of the Profile tab.
 *
 *              Shows the photo the student actually has, a preview of the one
 *              they just chose, and saves it to Storage. The preview is the point:
 *              uploading a photo you cannot see first is a guess, and a 2 MB limit
 *              means a rejected file is a real possibility worth catching before
 *              the round trip.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { AlertCircle, Camera, Check, Loader2 } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { Button } from '@/components/ui/button';
import { updateAvatar } from '@/features/profile/actions';

export interface AvatarFormProps {
  fullName: string;
  avatarUrl: string | null;
}

/**
 * Renders the photo upload section.
 *
 * @param fullName  - Used for the fallback initial.
 * @param avatarUrl - The saved photo, or null.
 * @returns The section element.
 */
export function AvatarForm({ fullName, avatarUrl }: AvatarFormProps) {
  const [state, formAction, pending] = useActionState(updateAvatar, null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const error = state && !state.ok ? state.error : null;
  const saved = state?.ok === true;

  /* Object URLs are a leak if they are never revoked. */
  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  return (
    <section aria-labelledby="photo-heading" className="clay-card p-6">
      <h2 id="photo-heading" className="font-heading text-headline-md">
        Your photo
      </h2>
      <p className="text-on-surface-variant mt-1 mb-5 text-body-md text-pretty">
        Classmates see this on your match card and at the top of a conversation.
      </p>

      <form action={formAction} className="flex flex-wrap items-center gap-5">
        {preview ? (
          /* Not MatchAvatar: this is a local object URL, and next/image would
             try to optimise a blob it cannot fetch. */
          <span className="border-brand relative block size-20 shrink-0 overflow-hidden rounded-full border-4 shadow-md">
            <Image src={preview} alt="" fill sizes="80px" className="object-cover" unoptimized />
          </span>
        ) : (
          <MatchAvatar fullName={fullName} avatarUrl={avatarUrl} size={80} />
        )}

        <div className="flex flex-col gap-2">
          <label
            htmlFor="avatar"
            className="clay-btn-secondary focus-within:ring-brand/35 flex w-fit cursor-pointer items-center gap-2 rounded-md px-4 py-2 text-label-md focus-within:ring-4"
          >
            <Camera className="size-4" aria-hidden="true" />
            {preview ? 'Choose a different photo' : 'Choose a photo'}
            <input
              ref={inputRef}
              id="avatar"
              name="avatar"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setPreview(file ? URL.createObjectURL(file) : null);
              }}
            />
          </label>

          <p className="text-outline text-label-sm font-normal">
            JPG, PNG or WebP, up to 2 MB.
          </p>
        </div>

        {preview ? (
          <Button type="submit" disabled={pending} className="ml-auto">
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Save photo
          </Button>
        ) : null}
      </form>

      {error ? (
        <p role="alert" className="text-destructive mt-3 flex items-start gap-2 text-label-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error.message}
        </p>
      ) : null}

      {saved ? (
        <p role="status" className="text-brand mt-3 flex items-center gap-2 text-label-sm">
          <Check className="size-4" aria-hidden="true" />
          Photo updated everywhere.
        </p>
      ) : null}
    </section>
  );
}
