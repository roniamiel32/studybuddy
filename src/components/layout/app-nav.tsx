/**
 * File:        src/components/layout/app-nav.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The application's primary navigation, rendered as a centred menu on
 *              desktop and a bottom bar on mobile.
 *
 *              THREE DESTINATIONS PLUS A CALL TO ACTION, which is the shape of the
 *              redesign. Match was a peer of the other tabs and is now the primary
 *              button: it is the thing the product exists to do, and a link in a row
 *              of four said the opposite. Profile left the bar entirely for the user
 *              menu at the far right.
 *
 *              The mobile bar keeps five items rather than mirroring this. A phone
 *              has no room for a dropdown in a fixed 56px bar, so Profile stays a
 *              destination there and Match stays a tab — the alternative is a
 *              hamburger, which hides the two things people use most.
 *
 *              Groups became a destination here and needed a page: `/groups` lists
 *              the groups you are in. Groups are still created and discovered on a
 *              course page, because a group belongs to a course.
 * Version:     0.16.0
 *
 * Modifications:
 *     0.16.0 - 2026-08-10 - Redesign: Courses/Groups/Messages, Match as the CTA,
 *                           Profile moved into the user menu
 *     0.15.0 - 2026-08-10 - Join-request badge on Courses (Phase 5)
 *     0.13.0 - 2026-08-10 - Requests renamed to Messages
 *     0.12.0 - 2026-08-10 - Unread badge on Requests (Phase 3)
 *     0.8.0  - 2026-08-05 - Initial implementation (Phase 2)
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GraduationCap, MessageSquare, Sparkles, UserRound, Users } from 'lucide-react';

import {
  UnreadDot,
  UnreadText,
  usePendingRequestCount,
  useUnreadCount,
} from '@/components/layout/unread-badge';
import { cn } from '@/lib/utils';

/**
 * The centred menu, left to right as specified.
 *
 * The join-request badge moved from Courses to Groups with this redesign. Requests
 * are group requests, and a badge on Courses meant a student had to guess which of
 * the two tabs was asking for their attention.
 */
const DESTINATIONS = [
  { href: '/courses', label: 'Courses', icon: GraduationCap },
  { href: '/groups', label: 'Groups', icon: Users, requests: true },
  { href: '/messages', label: 'Messages', icon: MessageSquare, badge: true },
] as const;

/** Match is the call to action, so it is not in DESTINATIONS. */
const MATCH_HREF = '/dashboard';

export interface NavProps {
  /** Unread total from the server, so the badge is right on first paint. */
  unreadCount: number;
  /** Join requests waiting on this student as a group admin. */
  pendingRequestCount: number;
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
 * The glowing pill that leads to the matches screen.
 *
 * A gradient plus a coloured shadow in the same hue, which is what reads as "glow"
 * — a blur behind the element would bleed past the pill's edge on the glass header.
 *
 * Reads the pathname itself rather than taking it as a prop, so the server layout
 * that renders it does not have to become a client component to know.
 *
 * @returns The link element.
 */
export function MatchButton() {
  const pathname = usePathname();
  const active = isActive(pathname, MATCH_HREF);

  return (
    <Link
      href={MATCH_HREF}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'focus-visible:ring-brand/35 flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-label-md whitespace-nowrap text-white transition-all focus-visible:ring-4 focus-visible:outline-none',
        'bg-[linear-gradient(135deg,var(--color-grape-bright)_0%,var(--color-brand-bright)_55%,var(--color-brand)_100%)]',
        'shadow-[0_4px_14px_-2px_color-mix(in_oklab,var(--color-brand)_55%,transparent)]',
        'hover:brightness-110 hover:shadow-[0_6px_18px_-2px_color-mix(in_oklab,var(--color-brand)_65%,transparent)]',
        active && 'ring-brand/30 ring-4',
      )}
    >
      <Sparkles className="size-4" aria-hidden="true" />
      Match
    </Link>
  );
}

/**
 * The centred menu for the desktop header.
 *
 * @param unreadCount         - Server-rendered unread total.
 * @param pendingRequestCount - Server-rendered pending join requests.
 * @param viewerId            - The signed-in student.
 * @returns The nav element.
 */
export function DesktopNav({ unreadCount, pendingRequestCount, viewerId }: NavProps) {
  const pathname = usePathname();
  const unread = useUnreadCount(unreadCount, viewerId);
  const requests = usePendingRequestCount(pendingRequestCount, viewerId);

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
            {/* Relative wrapper on the ICON, not the link: the badge belongs over
                the icon, not over the whole pill. */}
            <span className="relative flex">
              <Icon className="size-4" aria-hidden="true" />
              {'badge' in destination ? <UnreadDot count={unread} /> : null}
              {'requests' in destination ? <UnreadDot count={requests} /> : null}
            </span>
            {label}
            {/* After the label, so the link announces "Messages, 2 unread
                messages" rather than leading with a bare number. */}
            {'badge' in destination ? <UnreadText count={unread} /> : null}
            {'requests' in destination ? (
              <UnreadText count={requests} noun="join request" />
            ) : null}
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
 * @param unreadCount         - Server-rendered unread total.
 * @param pendingRequestCount - Server-rendered pending join requests.
 * @param viewerId            - The signed-in student.
 * @returns The nav element.
 */
export function MobileNav({ unreadCount, pendingRequestCount, viewerId }: NavProps) {
  const pathname = usePathname();
  const unread = useUnreadCount(unreadCount, viewerId);
  const requests = usePendingRequestCount(pendingRequestCount, viewerId);

  /*
   * Five, not three. The desktop header hides Profile in a dropdown and promotes
   * Match to a button; neither fits a fixed bottom bar, so on a phone both stay
   * destinations. Same routes, same badges, different affordance.
   */
  const mobileDestinations = [
    { href: MATCH_HREF, label: 'Match', icon: Sparkles },
    ...DESTINATIONS,
    { href: '/students/${viewerId}', label: 'Profile', icon: UserRound },
  ] as const;

  return (
    <nav
      aria-label="Main"
      className="glass shadow-nav fixed bottom-0 left-0 z-50 flex w-full items-center justify-around rounded-t-xl px-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
    >
      {mobileDestinations.map((destination) => {
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
              * descendant with no way for a child to opt out. With the class on the
              * link, the unread badge would be faded too — on the one tab where it
              * matters most, since a student notices a badge precisely when they are
              * somewhere else.
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
                className={cn('size-1 rounded-full', active ? 'bg-grape' : 'bg-transparent')}
              />
            </span>

            {'badge' in destination ? (
              <>
                <UnreadDot count={unread} variant="mobile" />
                <UnreadText count={unread} />
              </>
            ) : null}
            {'requests' in destination ? (
              <>
                <UnreadDot count={requests} variant="mobile" />
                <UnreadText count={requests} noun="join request" />
              </>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
