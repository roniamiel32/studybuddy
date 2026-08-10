/**
 * File:        src/components/layout/profile-badge.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The signed-in student's photo or initial badge, shown top-left in
 *              the app header.
 * Version:     0.6.2
 *
 * Modifications:
 *     0.6.2 - 2026-08-10 - Removed text label to keep the header clean
 *     0.6.1 - 2026-08-05 - Initial implementation
 */

import Image from 'next/image';

export interface ProfileBadgeProps {
  fullName: string | null;
  avatarUrl: string | null;
}

/**
 * Renders the avatar or initial badge.
 *
 * @param fullName  - The student's saved name, if any.
 * @param avatarUrl - Public URL of their photo, if any.
 * @returns The badge element.
 */
export function ProfileBadge({ fullName, avatarUrl }: ProfileBadgeProps) {
  const firstName = fullName?.trim().split(/\s+/)[0] ?? '';
  const initial = firstName.charAt(0).toUpperCase() || '?';

  return (
    <span className="border-outline-variant/50 bg-brand-fixed relative size-9 shrink-0 overflow-hidden rounded-full border inline-flex">
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
  );
}