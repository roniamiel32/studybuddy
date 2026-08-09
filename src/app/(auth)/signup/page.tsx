/**
 * File:        src/app/(auth)/signup/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Account creation. The university email domain is the enrolment
 *              check — there is no separate invite or verification step.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import type { Metadata } from 'next';

import { CredentialForm } from '@/components/auth/credential-form';
import { signUp } from '@/features/auth/actions';

export const metadata: Metadata = {
  title: 'Create your account',
};

/**
 * Renders the sign-up page.
 *
 * @returns The page element.
 */
export default function SignUpPage() {
  return (
    <>
      <h1 className="font-heading text-headline-lg">Create your account</h1>
      <p className="text-on-surface-variant mt-2 mb-7 text-body-md text-pretty">
        Four short steps and you will be looking at study partners in your own
        courses.
      </p>

      <CredentialForm mode="signup" action={signUp} />
    </>
  );
}
