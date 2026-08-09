/**
 * File:        src/app/(auth)/layout.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Shell for the credential pages — a single centred card on the
 *              dotted field, with no navigation. There is nowhere else to go
 *              from here, and offering links would only invite wandering off
 *              mid-signup.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import Link from 'next/link';

import { Wordmark } from '@/components/marketing/wordmark';

/**
 * Wraps the sign-up and sign-in pages.
 *
 * @param children - The credential page being rendered.
 * @returns The layout element.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-dotted flex min-h-full flex-1 flex-col items-center justify-center px-5 py-12">
      <Link
        href="/"
        className="focus-visible:ring-brand/35 mb-8 rounded-md focus-visible:ring-4 focus-visible:outline-none"
      >
        <Wordmark />
      </Link>

      <div className="border-outline-variant/30 shadow-clay w-full max-w-md rounded-xl border bg-white p-7 sm:p-8">
        {children}
      </div>
    </div>
  );
}
