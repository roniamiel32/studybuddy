/**
 * File:        src/components/profiles/profile-link.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The one way a person's name or face becomes a way of reaching
 *              their profile.
 *
 *              IT EXISTS TO BE THE ONLY ANSWER. The same three lines —
 *              `id ? <Link href={`/students/${id}`}>…</Link> : name` — had been
 *              written out by hand in eight components and forgotten in six
 *              more, which is exactly the shape of thing that drifts: a new card
 *              gets built, the author copies the markup from whichever
 *              neighbour they happened to open, and whether a name is clickable
 *              becomes a matter of which file they looked at. One component
 *              means "is this linked?" has a single answer that can be checked
 *              by grep.
 *
 *              A NULL ID RENDERS PLAIN TEXT, NOT A BROKEN LINK. Authorship
 *              survives deletion in this schema — `author_id` goes null while
 *              the post stays — so "Former student" is a real and common case,
 *              and /students/null is a 404 wearing a pointer cursor.
 *
 *              IT REFUSES TO NEST. An anchor inside an anchor is invalid markup
 *              that navigates to the wrong place when pressed, and several of
 *              the rows this is used in are themselves links. `nested` opts into
 *              a span that carries the same hover affordance without the href,
 *              so a caller inside a row-link degrades honestly instead of
 *              producing markup the browser has to guess at.
 * Version:     0.32.0
 *
 * Modifications:
 *     0.32.0 - 2026-08-15 - Initial implementation (Phase 10A)
 */

import Link from 'next/link';

import { cn } from '@/lib/utils';

export interface ProfileLinkProps {
  /** Whose profile. Null for a student whose account is gone. */
  profileId: string | null | undefined;
  /** Their name or avatar — whatever is standing in for them on screen. */
  children: React.ReactNode;
  className?: string;
  /**
   * True when this sits inside another anchor. Renders a span instead, so the
   * enclosing row keeps its own single destination.
   */
  nested?: boolean;
  /**
   * Overrides the accessible name. Worth setting when the child is an avatar
   * with no text of its own, so the link is not announced as "link, image".
   */
  label?: string;
}

/**
 * Wraps a name or avatar so it opens that student's profile.
 *
 * @returns A link, or plain content when there is nobody to link to.
 */
export function ProfileLink({
  profileId,
  children,
  className,
  nested = false,
  label,
}: ProfileLinkProps) {
  if (!profileId || nested) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Link
      href={`/students/${profileId}`}
      aria-label={label}
      className={cn(
        'hover:text-brand focus-visible:ring-brand/35 rounded-sm transition-colors',
        'focus-visible:ring-2 focus-visible:outline-none',
        className,
      )}
    >
      {children}
    </Link>
  );
}
