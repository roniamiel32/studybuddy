/**
 * File:        src/components/layout/app-nav.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The application's primary navigation, rendered as a top bar on
 *              desktop and a bottom bar on mobile.
 *
 *              Four destinations, matching the source design's shape. The
 *              design's "Chat" tab is called "Requests" here (design conflict
 *              C2) — the name the rest of the app already uses for it, kept so
 *              this stays one vocabulary rather than two. It now leads to the
 *              conversations built in Phase 3, and carries the unread badge.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Unread badge on Requests (Phase 3)
 *     0.8.0  - 2026-08-05 - Initial implementation (Phase 2)
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GraduationCap, Inbox, Sparkles, UserRound } from 'lucide-react';

import { UnreadDot, UnreadText, useUnreadCount } from '@/components/layout/unread-badge';
import { cn } from '@/lib/utils';

const DESTINATIONS = [
  { href: '/dashboard', label: 'Match', icon: Sparkles },
  { href: '/courses', label: 'Courses', icon: GraduationCap },
  /* The only destination that carries a count, hence the flag rather than a
     lookup by href in the render. */
  { href: '/requests', label: 'Requests', icon: Inbox, badge: true },
  { href: '/settings', label: 'Profile', icon: UserRound },
] as const;

export interface NavProps {
  /** Unread total from the server, so the badge is right on first paint. */
  unreadCount: number;
  viewerId: string;
}

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
export function DesktopNav({ unreadCount, viewerId }: NavProps) {
  const pathname = usePathname();
  const unread = useUnreadCount(unreadCount, viewerId);

  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {DESTINATIONS.map((destination) => {
        const { href, label, icon: Icon } = destination;
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
            {/* Relative wrapper on the ICON, not the link: the badge belongs
                over the icon, as in the reference, not over the whole pill. */}
            <span className="relative flex">
              <Icon className="size-4" aria-hidden="true" />
              {'badge' in destination ? <UnreadDot count={unread} /> : null}
            </span>
            {label}
            {/* After the label, so the link announces "Requests, 2 unread
                messages" rather than leading with a bare number. */}
            {'badge' in destination ? <UnreadText count={unread} /> : null}
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
export function MobileNav({ unreadCount, viewerId }: NavProps) {
  const pathname = usePathname();
  const unread = useUnreadCount(unreadCount, viewerId);

  return (
    <nav
      aria-label="Main"
      className="glass shadow-nav fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-xl px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
    >
      {DESTINATIONS.map((destination) => {
        const { href, label, icon: Icon } = destination;
        const active = isActive(pathname, href);

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'focus-visible:ring-brand/35 relative flex flex-1 flex-col items-center justify-center gap-1 rounded-md py-1 transition-opacity focus-visible:ring-4 focus-visible:outline-none',
              active ? 'text-brand' : 'text-on-surface-variant',
            )}
          >
            {/*
              * The dimming sits on the icon and label, NOT on the link.
              *
              * An inactive tab is faded to 60%, and CSS opacity applies to every
              * descendant with no way for a child to opt out. With the class on
              * the link, the unread badge would be faded too — on the one tab
              * where it matters most, since Requests is inactive precisely when
              * a student needs to notice something arrived.
              */}
            <span
              className={cn(
                'flex flex-col items-center gap-1 transition-opacity',
                active ? 'opacity-100' : 'opacity-60',
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
            </span>

            {'badge' in destination ? (
              <>
                <UnreadDot count={unread} variant="mobile" />
                <UnreadText count={unread} />
              </>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
