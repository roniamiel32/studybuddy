/**
 * File:        src/app/(auth)/verify-email/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The last step of registration — the code from the sign-up email.
 *
 *              THE ADDRESS TRAVELS IN THE QUERY STRING, because at this point
 *              there is no session to keep it in: with confirmations on, sign-up
 *              creates an account and nothing else. It is not a secret — the
 *              student just typed it — and verifyOtp needs both halves.
 * Version:     0.23.0
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Initial implementation (Phase 9A)
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { VerifyEmailForm } from '@/components/auth/verify-email-form';

export const metadata: Metadata = { title: 'Confirm your email' };

/**
 * Renders the verification page.
 *
 * @param searchParams - Carries the address the code was sent to.
 * @returns The page element.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  /* Reached without an address — there is nothing to confirm and no way to ask.
     Back to sign-up rather than showing a form that cannot be submitted. */
  if (!email) {
    redirect('/signup');
  }

  return (
    <>
      <h1 className="font-heading text-headline-lg">Confirm your email</h1>
      <p className="text-on-surface-variant mt-2 mb-7 text-body-md text-pretty">
        We sent a six-digit code to <span className="text-on-surface font-semibold">{email}</span>.
        Enter it here to finish setting up your account.
      </p>

      <VerifyEmailForm email={email} />

      <p className="text-on-surface-variant mt-5 text-center text-body-md">
        Wrong address?{' '}
        <Link
          href="/signup"
          className="text-brand focus-visible:ring-brand/35 rounded-sm font-semibold underline underline-offset-4 focus-visible:ring-4 focus-visible:outline-none"
        >
          Start again
        </Link>
      </p>
    </>
  );
}
