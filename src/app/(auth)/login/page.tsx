/**
 * File:        src/app/(auth)/login/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Sign-in. Sends students to the dashboard, or back into
 *              onboarding if they left it unfinished.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import type { Metadata } from 'next';

import { CredentialForm } from '@/components/auth/credential-form';
import { signIn } from '@/features/auth/actions';

export const metadata: Metadata = {
  title: 'Sign in',
};

/**
 * Renders the sign-in page.
 *
 * @returns The page element.
 */
export default function LoginPage() {
  return (
    <>
      <h1 className="font-heading text-headline-lg">Welcome back</h1>
      <p className="text-on-surface-variant mt-2 mb-7 text-body-md">
        Sign in to pick up where you left off.
      </p>

      <CredentialForm mode="signin" action={signIn} />
    </>
  );
}
