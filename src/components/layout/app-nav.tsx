/**
 * File:        src/components/layout/app-nav.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The application's primary navigation, rendered as a top bar on
 *              desktop and a bottom bar on mobile.
 *
 *              Four destinations, matching the source design's shape. The
 *              design's "Chat" tab is replaced by "Requests" (design conflict
 *              C2): there is no in-app chat, and the accept/decline flow that
 *              decision D2 introduced had nowhere to live.
 * Version:     0.8.0
 *
 * Modifications:
 *     0.8.0 - 2026-08-05 - Initial implementation (Phase 2)
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GraduationCap, Inbox, Sparkles, UserRound } from 'lucide-react';

import { cn } from '@/lib/utils';

const DESTINATIONS = [
  { href: '/dashboard', label: 'Match', icon: Sparkles },
  { href: '/courses', label: 'Courses', icon: GraduationCap },
  { href: '/requests', label: 'Requests', icon: Inbox },
  { href: '/settings', label: 'Profile', icon: UserRound },
] as const;

/**
 * Reports whether a destination is the active one.
 *
 * Prefix matching, so `/courses/[id]` keeps the Courses tab lit rather than
 * leaving the whole bar looking inactive on a detail page.
 *
 * @param pathname - The current path.
 * @param href     - The destination to test.
 * @returns True when the destination is active.
 */
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Horizontal navigation for the desktop header.
 *
 * @returns The nav element.
 */
export function DesktopNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {DESTINATIONS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'focus-visible:ring-brand/35 flex items-center gap-2 rounded-full px-3.5 py-2 text-label-md transition-colors focus-visible:ring-4 focus-visible:outline-none',
              active
                ? 'text-brand bg-brand-fixed/60 font-bold'
                : 'text-on-surface-variant hover:bg-surface-container-high',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Fixed bottom bar for mobile, with the design's dot indicator on the active
 * destination.
 *
 * @returns The nav element.
 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="glass shadow-nav fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-xl px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
    >
      {DESTINATIONS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'focus-visible:ring-brand/35 flex flex-1 flex-col items-center justify-center gap-1 rounded-md py-1 transition-opacity focus-visible:ring-4 focus-visible:outline-none',
              active ? 'text-brand' : 'text-on-surface-variant opacity-60',
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
            <span className="text-label-sm">{label}</span>
            {/* The active dot. Decorative — aria-current already says which. */}
            <span
              aria-hidden="true"
              className={cn(
                'size-1 rounded-full',
                active ? 'bg-grape' : 'bg-transparent',
              )}
            />
          </Link>
        );
      })}
    </nav>
  );
}
