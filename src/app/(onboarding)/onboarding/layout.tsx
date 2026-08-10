/**
 * File:        src/app/(onboarding)/onboarding/layout.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Shell for the four-step flow: logo, a way out, the progress
 *              bar, and the current step in a clay card.
 * Version:     0.6.1
 *
 * Modifications:
 *     0.6.1 - 2026-08-10 - Replaced Wordmark with logo image only
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import Image from 'next/image';
import { X } from 'lucide-react';

import { OnboardingStepper } from '@/components/onboarding/stepper';
import { Button } from '@/components/ui/button';
import { signOut } from '@/features/auth/actions';

/**
 * Wraps every onboarding step.
 *
 * @param children - The step being rendered.
 * @returns The layout element.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-dotted flex min-h-full flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-5 py-5">
        
        {/* הלוגו הנקי בלבד במקום ה-Wordmark */}
        <Image
          src="/logo.png"
          alt="StudyBuddy"
          width={40}
          height={40}
          className="object-contain"
        />

        {/*
         * A deliberate exit. Without one, a student who wants to stop is stuck
         * on a form with no visible way out, since the middleware sends them
         * straight back here.
         */}
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            Exit setup
            <X />
          </Button>
        </form>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-20">
        <OnboardingStepper />

        <div className="border-outline-variant/30 shadow-clay mt-8 rounded-xl border bg-white p-6 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}