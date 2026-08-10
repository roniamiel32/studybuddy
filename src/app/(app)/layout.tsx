/**
 * File:        src/app/(app)/layout.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Shell for the signed-in application: a glass top bar with the
 *              student's photo and navigation, and a bottom bar on mobile.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Unread count for the navigation badge (Phase 3)
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 *     0.6.1 - 2026-08-05 - Avatar in the header
 *     0.8.0 - 2026-08-05 - Primary navigation (Phase 2)
 */

import Link from 'next/link';

import { DesktopNav, MobileNav } from '@/components/layout/app-nav';
import { ProfileBadge } from '@/components/layout/profile-badge';
import { Wordmark } from '@/components/marketing/wordmark';
import { Button } from '@/components/ui/button';
import { getUnreadCount } from '@/features/chat/queries';
import { signOut } from '@/features/auth/actions';
import { getOnboardingProfile } from '@/features/onboarding/queries';
import { requireUser } from '@/lib/supabase/server';

/**
 * Wraps every signed-in page.
 *
 * @param children - The page being rendered.
 * @returns The layout element.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [profile, user, unreadCount] = await Promise.all([
    getOnboardingProfile(),
    requireUser(),
    getUnreadCount(),
  ]);

  return (
    <div className="bg-pattern flex min-h-full flex-1 flex-col">
      <header className="glass border-outline-variant/30 sticky top-0 z-40 border-b">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link
            href="/dashboard"
            className="focus-visible:ring-brand/35 flex shrink-0 items-center gap-3 rounded-md focus-visible:ring-4 focus-visible:outline-none"
          >
            <ProfileBadge fullName={profile.fullName} avatarUrl={profile.avatarUrl} />
            <Wordmark className="text-body-lg" />
          </Link>

          <DesktopNav unreadCount={unreadCount} viewerId={user.id} />

          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      {/* Bottom padding clears the mobile nav, which is fixed over the content. */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pt-6 pb-28 sm:pt-10 md:pb-12">
        {children}
      </main>

      <MobileNav unreadCount={unreadCount} viewerId={user.id} />
    </div>
  );
}
