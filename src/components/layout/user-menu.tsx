/**
 * File:        src/components/layout/user-menu.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The consolidated user area at the far right of the header: a
 *              stadium-shaped control holding the avatar, the student's first name
 *              and a chevron, which opens a menu with Profile, Dark Mode toggle, and Sign out.
 * Version:     0.17.0
 *
 * Modifications:
 *     0.17.0 - 2026-08-10 - Added dark/light mode toggle inside the user menu
 *     0.16.0 - 2026-08-10 - Initial implementation
 */

'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { ChevronDown, LogOut, Moon, Sun, UserRound } from 'lucide-react';

import { ProfileBadge } from '@/components/layout/profile-badge';

export interface UserMenuProps {
  fullName: string | null;
  avatarUrl: string | null;
  /** The sign-out server action, passed in so this stays a client component. */
  signOut: () => Promise<void>;
}

/**
 * Renders the user area and its dropdown.
 *
 * @param fullName  - The student's saved name, for the label and the initial.
 * @param avatarUrl - Their photo, if any.
 * @param signOut   - The sign-out action.
 * @returns The menu element.
 */
export function UserMenu({ fullName, avatarUrl, signOut }: UserMenuProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

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
    <details ref={detailsRef} className="relative shrink-0">
      {/*
        * The stadium. list-none removes the disclosure triangle that <summary>
        * renders by default, in both WebKit and Firefox.
        */}
      <summary
        aria-label={`Your account, ${firstName}`}
        className="border-outline-variant/60 hover:border-brand/50 focus-visible:ring-brand/35 flex cursor-pointer list-none items-center gap-2 rounded-full border bg-white/80 py-1 pr-3 pl-1 shadow-clay-soft transition-colors focus-visible:ring-4 focus-visible:outline-none [&::-webkit-details-marker]:hidden"
      >
        <ProfileBadge fullName={fullName} avatarUrl={avatarUrl} />
        <span className="text-label-md hidden sm:inline">{firstName}</span>
        <ChevronDown className="text-outline size-4" aria-hidden="true" />
      </summary>

      <div className="border-outline-variant/40 absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-lg border bg-white shadow-clay-lifted">
        <Link
          href="/settings"
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
  );
}