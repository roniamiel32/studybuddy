/**
 * File:        src/components/layout/user-menu.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The consolidated user area at the far right of the header: a
 *              stadium-shaped control holding the avatar, the student's first name
 *              and a chevron.
 *
 *              TWO CONTROLS IN ONE SHAPE, and the split is the point. The avatar
 *              and the name are a LINK to the student's own profile, because that
 *              is what a face and a name in a header mean everywhere else on the
 *              web — pressing them to be told "here is a menu, now press Profile"
 *              is a step that exists only because the markup was convenient.
 *
 *              THE CHEVRON KEEPS THE MENU, and it has to: Sign out lives in there
 *              and has nowhere else to go. A chevron is also the conventional
 *              "there is more here" affordance, so the two halves read as what
 *              they are without a label explaining them.
 *
 *              The stadium's border is on the wrapper rather than on either half,
 *              so the pair still looks like one control. <summary> must be a
 *              direct child of <details>, which is why the link is a sibling of
 *              the whole <details> rather than living inside it.
 * Version:     0.51.0
 *
 * Modifications:
 *     0.51.0 - 2026-08-20 - The avatar and name link straight to the profile
 */

'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, LogOut, Moon, Sun, UserRound } from 'lucide-react';

import { ProfileBadge } from '@/components/layout/profile-badge';

export interface UserMenuProps {
  viewerId: string;
  fullName: string | null;
  avatarUrl: string | null;
  /** The sign-out server action, passed in so this stays a client component. */
  signOut: () => Promise<void>;
}

/**
 * Renders the user area and its dropdown.
 *
 * @param viewerId  - The ID of the signed-in student.
 * @param fullName  - The student's saved name, for the label and the initial.
 * @param avatarUrl - Their photo, if any.
 * @param signOut   - The sign-out action.
 * @returns The menu element.
 */
export function UserMenu({ viewerId, fullName, avatarUrl, signOut }: UserMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  /* First name only: the header is not the place for someone's full legal name. */
  const firstName = fullName?.trim().split(/\s+/)[0] ?? 'You';

  /* Close on navigation. Without this the menu stays open behind the new page,
     because the component is not remounted by a client-side route change. */
  useEffect(() => {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  }, [pathname]);

  /*
   * Click outside to close — the one thing <details> does not do for us. Escape and
   * toggle-on-click are already handled by the element itself.
   */
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const details = detailsRef.current;

      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    };

    document.addEventListener('pointerdown', onPointerDown);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  return (
    /* The stadium is the wrapper now, so the link and the chevron sit inside one
       border and read as a single control. */
    <div className="border-outline-variant/60 hover:border-brand/50 relative flex shrink-0 items-center rounded-full border bg-white/80 py-1 pr-2 pl-1 shadow-clay-soft transition-colors">
      <Link
        href={`/students/${viewerId}`}
        aria-label={`Your profile, ${firstName}`}
        className="focus-visible:ring-brand/35 flex items-center gap-2 rounded-full focus-visible:ring-4 focus-visible:outline-none"
      >
        <ProfileBadge fullName={fullName} avatarUrl={avatarUrl} />
        <span className="text-label-md hidden sm:inline">{firstName}</span>
      </Link>

      <details ref={detailsRef} className="relative">
        {/* list-none removes the disclosure triangle that <summary> renders by
            default, in both WebKit and Firefox. */}
        <summary
          aria-label="Account menu"
          className="focus-visible:ring-brand/35 flex cursor-pointer list-none items-center rounded-full px-1.5 py-1.5 focus-visible:ring-4 focus-visible:outline-none [&::-webkit-details-marker]:hidden"
        >
          <ChevronDown className="text-outline size-4" aria-hidden="true" />
        </summary>

        <div className="border-outline-variant/40 absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-lg border bg-white shadow-clay-lifted">
        <Link
          href={`/students/${viewerId}`}
          className="text-on-surface-variant hover:bg-surface-container-high focus-visible:ring-brand/35 flex items-center gap-2.5 px-4 py-3 text-label-md transition-colors focus-visible:ring-4 focus-visible:outline-none focus-visible:-outline-offset-2"
        >
          <UserRound className="size-4" aria-hidden="true" />
          Profile
        </Link>
          <form action={signOut} className="border-outline-variant/40 border-t">
            <button
              type="submit"
              className="text-on-surface-variant hover:bg-surface-container-high focus-visible:ring-brand/35 flex w-full items-center gap-2.5 px-4 py-3 text-left text-label-md transition-colors focus-visible:ring-4 focus-visible:outline-none"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}