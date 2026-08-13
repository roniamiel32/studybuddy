/**
 * File:        src/app/(app)/layout.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Shell for the signed-in application.
 *
 *              The header runs left to right: brand, centred menu, the Match call
 *              to action, and the consolidated user menu. Sign out used to sit in
 *              the header as a bare button, which gave the most destructive action
 *              on the screen the same weight as navigation; it now lives inside the
 *              user menu.
 * Version:     0.16.0
 *
 * Modifications:
 *     0.24.0 - 2026-08-13 - The new-academic-year prompt (Phase 9B)
 *     0.16.0 - 2026-08-10 - Header redesign: centred menu, Match call to action,
 *                           consolidated user menu
 *     0.15.0 - 2026-08-10 - Pending join-request count for the badge (Phase 5)
 *     0.12.0 - 2026-08-10 - Unread count for the navigation badge (Phase 3)
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 *     0.6.1 - 2026-08-05 - Avatar in the header
 *     0.8.0 - 2026-08-05 - Primary navigation (Phase 2)
 */

import Link from 'next/link';

import { Logo } from '@/components/ui/logo';
import { DesktopNav, MatchButton, MobileNav } from '@/components/layout/app-nav';
import { UpdateYearDialog } from '@/components/profile/update-year-dialog';
import { getUnreadNotificationCount } from '@/features/notifications/queries';
import { UserMenu } from '@/components/layout/user-menu';
import { getUnreadCount } from '@/features/chat/queries';
import { getPendingRequestCount } from '@/features/groups/queries';
import { signOut } from '@/features/auth/actions';
import { shouldPromptForAcademicYear } from '@/features/profile/academic-year';
import { getOnboardingProfile } from '@/features/onboarding/queries';
import { requireUser } from '@/lib/supabase/server';

/**
 * Wraps every signed-in page.
 *
 * @param children - The page being rendered.
 * @returns The layout element.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [profile, user, unreadCount, pendingRequestCount, notificationCount] =
    await Promise.all([
      getOnboardingProfile(),
      requireUser(),
      getUnreadCount(),
      getPendingRequestCount(),
      /* Counts only — see the note in features/notifications/queries.ts on why
         the badge deliberately does not materialise derived notifications. */
      getUnreadNotificationCount(),
    ]);

  /*
   * IN THE LAYOUT RATHER THAN ON ONE PAGE, because there is no single page every
   * student passes through — /dashboard is the entry point but a link from a
   * notification or a bookmark lands anywhere, and the year would stay wrong
   * until they happened to visit the right screen. Onboarding is outside this
   * layout, so someone half-registered is never asked.
   *
   * The whole decision is in shouldPromptForAcademicYear: the autumn window, the
   * six-month gap, and the two cases where there is nothing to advance.
   */
  const askAboutYear = shouldPromptForAcademicYear({
    yearOfStudy: profile.yearOfStudy,
    lastPromptDate: profile.lastYearPromptDate,
    onboardingCompletedAt: profile.onboardingCompletedAt,
  });

  return (
    <div className="bg-pattern flex min-h-full flex-1 flex-col">
      {/* Non-null asserted safely: the guard above returns false for a null year. */}
      {askAboutYear ? <UpdateYearDialog yearOfStudy={profile.yearOfStudy!} /> : null}

      <header className="glass border-outline-variant/30 sticky top-0 z-40 border-b">
        {/*
          * Four zones, left to right: brand, menu, call to action, user.
          *
          * The menu is centred with `justify-between` plus a nav that grows, rather
          * than absolute positioning: the brand and the user area have different
          * widths depending on the name, and centring by layout keeps the menu put
          * as either changes.
          */}
        <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-5 py-2.5">
          {/* ---- Far left: brand ------------------------------------------- */}
          <Link
            href="/dashboard"
            aria-label="StudyBuddy home"
            className="focus-visible:ring-brand/35 flex shrink-0 items-center rounded-md focus-visible:ring-4 focus-visible:outline-none"
          >
            <Logo />
          </Link>

          {/* ---- Centre: the menu ------------------------------------------ */}
          <div className="flex flex-1 justify-center">
            <DesktopNav
              unreadCount={unreadCount}
              pendingRequestCount={pendingRequestCount}
              notificationCount={notificationCount}
              viewerId={user.id}
            />
          </div>

          {/* ---- Right: the call to action, then the user ------------------ */}
          <div className="flex shrink-0 items-center gap-3">
            {/* Hidden on mobile, where Match is a tab in the bottom bar. */}
            <span className="hidden md:inline-flex">
              <MatchButton />
            </span>

            <UserMenu
              viewerId={user.id}
              fullName={profile.fullName}
              avatarUrl={profile.avatarUrl}
              signOut={signOut}
            />
          </div>
        </div>
      </header>

      {/* Bottom padding clears the mobile nav, which is fixed over the content. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-6 pb-28 sm:pt-10 md:pb-12">
        {children}
      </main>

      <MobileNav
        unreadCount={unreadCount}
        pendingRequestCount={pendingRequestCount}
        notificationCount={notificationCount}
        viewerId={user.id}
      />
    </div>
  );
}
