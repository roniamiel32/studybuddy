/**
 * File:        src/features/auth/actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Email + password authentication. The university email domain is
 *              the enrolment check: it decides which institution a student
 *              belongs to and whether they may sign up at all, which is why it
 *              is verified here rather than only in the database trigger.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

'use server';

import { redirect } from 'next/navigation';

import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

import { emailDomain, signInSchema, signUpSchema } from './schema';

/**
 * Checks whether an email domain belongs to a participating institution.
 *
 * Uses the admin client because the caller is, by definition, not yet signed in
 * and so cannot read `university_domains` under RLS. It returns only a boolean
 * and the institution's name, never anything about other students.
 *
 * @param email - The address being used to sign up.
 * @returns The institution's name when the domain is a recognised student
 *          domain, otherwise null.
 */
async function institutionForEmail(email: string): Promise<string | null> {
  const domain = emailDomain(email);
  if (!domain) {
    return null;
  }

  const admin = createAdminClient();

  const { data } = await admin
    .from('university_domains')
    .select('is_student_domain, universities(name)')
    .eq('domain', domain)
    .eq('is_student_domain', true)
    .maybeSingle();

  return data?.universities?.name ?? null;
}

/**
 * Creates an account for a student at a participating institution.
 *
 * The profile row itself is created by the `handle_new_user` database trigger,
 * which resolves the university from the same domain. This function's job is to
 * refuse an unrecognised domain with a message a person can act on, rather than
 * letting the trigger raise a database error at them.
 *
 * @param _previous - Previous form state, supplied by useActionState.
 * @param formData  - The submitted form.
 * @returns A failed ActionResult, or redirects to onboarding on success.
 */
export async function signUp(
  _previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  let shouldRedirect = false;

  try {
    const parsed = signUpSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
    });

    const institution = await institutionForEmail(parsed.email);

    if (!institution) {
      return fail(
        ERROR_CODES.FORBIDDEN,
        'StudyBuddy is only open to participating universities. Use your university email address.',
        'email',
      );
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email: parsed.email,
      password: parsed.password,
    });

    if (error) {
      /*
       * Supabase reports an existing address as a generic failure to avoid
       * confirming which addresses are registered. Keep that property: a
       * message naming the account would turn this form into a way to test
       * whether a given student has signed up.
       */
      return fail(
        ERROR_CODES.VALIDATION_FAILED,
        'That did not work. Check the address and password, or sign in instead.',
        'email',
      );
    }

    shouldRedirect = true;
  } catch (error) {
    return toActionError(error, 'auth.signUp');
  }

  if (shouldRedirect) {
    redirect('/onboarding');
  }

  return ok(undefined);
}

/**
 * Signs an existing student in.
 *
 * @param _previous - Previous form state, supplied by useActionState.
 * @param formData  - The submitted form.
 * @returns A failed ActionResult, or redirects on success.
 */
export async function signIn(
  _previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  let destination = '/dashboard';

  try {
    const parsed = signInSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
    });

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.email,
      password: parsed.password,
    });

    if (error || !data.user) {
      // One message for both "no such account" and "wrong password", so the
      // form cannot be used to enumerate who has an account.
      return fail(ERROR_CODES.UNAUTHENTICATED, 'Those details did not match an account.');
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('id', data.user.id)
      .maybeSingle();

    destination = profile?.onboarding_completed_at ? '/dashboard' : '/onboarding';
  } catch (error) {
    return toActionError(error, 'auth.signIn');
  }

  redirect(destination);
}

/**
 * Signs the current student out and returns them to the landing page.
 *
 * @returns Never; always redirects.
 */
export async function signOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}
