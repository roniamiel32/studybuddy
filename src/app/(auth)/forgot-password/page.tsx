/**
 * File:        src/app/(auth)/forgot-password/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Find your account" — the first step of a password reset.
 * Version:     0.23.0
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Initial implementation (Phase 9A)
 */

import type { Metadata } from 'next';
import { AlertCircle } from 'lucide-react';

import { FindAccountForm } from '@/components/auth/find-account-form';

export const metadata: Metadata = { title: 'Find your account' };

/**
 * Renders the forgot-password page.
 *
 * @param searchParams - Carries `error` when the callback bounced them back
 *                       here with a spent or expired link.
 * @returns The page element.
 */
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <>
      {error === 'link-expired' ? (
        <p
          role="alert"
          className="text-destructive bg-destructive/10 mb-6 flex items-start gap-2 rounded-md p-3 text-label-md"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          That reset link has already been used or has expired. Ask for a new one below.
        </p>
      ) : null}

      <FindAccountForm />
    </>
  );
}
