/**
 * File:        src/app/(app)/layout.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Shell for the signed-in application. The nav is four items, per
 *              design conflict C2: the Stitch design's "Chat" tab is replaced
 *              by Requests, which the accept/decline flow needs and the design
 *              had nowhere to put.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import Link from 'next/link';

import { ProfileBadge } from '@/components/layout/profile-badge';
import { Wordmark } from '@/components/marketing/wordmark';
import { Button } from '@/components/ui/button';
import { signOut } from '@/features/auth/actions';
import { getOnboardingProfile } from '@/features/onboarding/queries';

/**
 * Wraps every signed-in page.
 *
 * @param children - The page being rendered.
 * @returns The layout element.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getOnboardingProfile();

  return (
    <div className="bg-dotted flex min-h-full flex-1 flex-col">
      <header className="glass border-outline-variant/30 sticky top-0 z-10 border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <Link
            href="/dashboard"
            className="focus-visible:ring-brand/35 flex items-center gap-3 rounded-md focus-visible:ring-4 focus-visible:outline-none"
          >
            <ProfileBadge fullName={profile.fullName} avatarUrl={profile.avatarUrl} />
            <Wordmark className="text-body-lg" />
          </Link>

          <form action={signOut}>
            <Button type="submit" variant="ghost" size="sm">
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:py-12">{children}</main>
    </div>
  );
}
