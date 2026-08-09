/**
 * File:        src/components/matching/match-avatar.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: A candidate's photo, with an initial on a tinted disc when they
 *              have not uploaded one. The source design assumes every student
 *              has a rendered 3D portrait; real ones mostly will not, so the
 *              fallback has to look deliberate rather than broken.
 * Version:     0.8.0
 *
 * Modifications:
 *     0.8.0 - 2026-08-05 - Initial implementation (Phase 2)
 */

import Image from 'next/image';

import { cn } from '@/lib/utils';

export interface MatchAvatarProps {
  fullName: string;
  avatarUrl: string | null;
  /** Rendered size in pixels; also drives the `sizes` hint. */
  size: number;
  className?: string;
}

/**
 * Renders a candidate's avatar.
 *
 * @param fullName  - Used for the fallback initial.
 * @param avatarUrl - Public Storage URL, or null.
 * @param size      - Pixel size.
 * @param className - Extra classes for the outer disc.
 * @returns The avatar element.
 */
export function MatchAvatar({ fullName, avatarUrl, size, className }: MatchAvatarProps) {
  const initial = fullName.trim().charAt(0).toUpperCase() || '?';

  return (
    <span
      className={cn(
        'from-brand-fixed relative block shrink-0 overflow-hidden rounded-full border-4 border-white bg-gradient-to-br to-[#f2f0ff] shadow-md',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-cover"
          /* Storage URLs are not known at build time. */
          unoptimized
        />
      ) : (
        <span
          aria-hidden="true"
          className="font-heading text-brand flex h-full w-full items-center justify-center"
          style={{ fontSize: Math.round(size / 2.5) }}
        >
          {initial}
        </span>
      )}
    </span>
  );
}
