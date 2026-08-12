/**
 * File:        src/app/(auth)/reset-password/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The second half of a password reset, reached from the emailed
 *              link by way of /auth/callback.
 *
 *              GUARDED HERE RATHER THAN IN THE PROXY. The recovery session is a
 *              real session, so the route guard would happily let a signed-in
 *              student wander in; and it is the *arriving from a link* that
 *              matters, not being signed in. Checking the session on the page
 *              means someone who types the URL is told to ask for a link
 *              instead of being shown a form that cannot work.
 * Version:     0.23.0
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Initial implementation (Phase 9A)
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Set a new password' };

/**
 * Renders the reset-password page.
 *
 * @returns The page element.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <>
        <h1 className="font-heading text-headline-lg">This link has expired</h1>
        <p className="text-on-surface-variant mt-2 mb-7 text-body-md text-pretty">
          Reset links last an hour and can only be used once. Ask for a new one and it
          will be in your inbox in a moment.
        </p>

        <Link
          href="/forgot-password"
          className="clay-btn-primary inline-flex items-center gap-2 rounded-md px-4 py-2 text-label-md"
        >
          Send a new link
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="font-heading text-headline-lg">Set a new password</h1>
      <p className="text-on-surface-variant mt-2 mb-7 text-body-md text-pretty">
        Enter it twice so we know there is no typo in it. You will stay signed in on this
        device.
      </p>

      <ResetPasswordForm />
    </>
  );
}
