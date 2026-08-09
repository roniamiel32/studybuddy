/**
 * File:        src/components/layout/profile-badge.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The signed-in student's photo and first name, shown top-left in
 *              the app header. Falls back to an initial when no photo has been
 *              uploaded, so the header never has a hole in it.
 * Version:     0.6.1
 *
 * Modifications:
 *     0.6.1 - 2026-08-05 - Initial implementation
 */

import Image from 'next/image';

export interface ProfileBadgeProps {
  fullName: string | null;
  avatarUrl: string | null;
}

/**
 * Renders the avatar and first name.
 *
 * @param fullName  - The student's saved name, if any.
 * @param avatarUrl - Public URL of their photo, if any.
 * @returns The badge element.
 */
export function ProfileBadge({ fullName, avatarUrl }: ProfileBadgeProps) {
  const firstName = fullName?.trim().split(/\s+/)[0] ?? '';
  const initial = firstName.charAt(0).toUpperCase() || '?';

  return (
    <span className="flex items-center gap-2.5">
      <span className="border-outline-variant/50 bg-brand-fixed relative size-9 shrink-0 overflow-hidden rounded-full border">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            fill
            sizes="36px"
            className="object-cover"
            /* Storage URLs are not known at build time. */
            unoptimized
          />
        ) : (
          <span className="font-heading text-brand flex h-full w-full items-center justify-center text-label-md">
            {initial}
          </span>
        )}
      </span>

      {firstName ? (
        <span className="text-label-md hidden sm:inline">{firstName}</span>
      ) : null}
    </span>
  );
}
