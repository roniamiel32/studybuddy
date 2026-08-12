/**
 * File:        src/features/auth/actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Email + password authentication. Any academic address is
 *              accepted; the domain decides which institution the student
 *              belongs to, and an institution is created on first sight if it
 *              is not already known.
 * Version:     0.10.0
 *
 * Modifications:
 *     0.10.0 - 2026-08-09 - Provisioning creates degrees, not tracks
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 *     0.6.1 - 2026-08-05 - Accept any .ac.il / .edu address, provisioning the
 *                          institution when the domain is new
 */

'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { createClient, requireUser } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isCurrentPassword } from '@/lib/supabase/credential-check';
import {
  REMEMBER_COOKIE,
  REMEMBER_COOKIE_MAX_AGE,
} from '@/lib/supabase/session-persistence';

import { emailDomain, institutionNameFromDomain, slugFromDomain } from './academic-email';
import {
  changePasswordSchema,
  findAccountSchema,
  newPasswordSchema,
  signInSchema,
  signUpSchema,
  verificationCodeSchema,
} from './schema';

/**
 * The origin to build email links against.
 *
 * Taken from the request rather than from an environment variable so that the
 * link works from whichever host the student actually reached — localhost, a
 * preview deployment, or production — instead of always pointing at whichever
 * one was configured last.
 *
 * @returns The scheme and host, with no trailing slash.
 */
async function requestOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? '127.0.0.1:3000';
  const protocol = headerList.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');

  return `${protocol}://${host}`;
}

/**
 * Degrees every new institution starts with.
 *
 * A student must be able to pick a degree on step 1, so a freshly provisioned
 * university cannot have an empty list. These are generic on purpose — they are
 * a scaffold to be replaced with the institution's real programmes, not a claim
 * about what it teaches. Each gets one same-named track, because a track is now
 * required to belong to a degree.
 */
const DEFAULT_DEGREES = [
  { code: 'CS', name: 'Computer Science' },
  { code: 'ENG', name: 'Engineering' },
  { code: 'BUS', name: 'Business' },
  { code: 'ECON', name: 'Economics' },
  { code: 'LAW', name: 'Law' },
  { code: 'SCI', name: 'Natural Sciences' },
  { code: 'SSCI', name: 'Social Sciences' },
  { code: 'HUM', name: 'Humanities' },
  { code: 'MED', name: 'Medicine & Health' },
  { code: 'ART', name: 'Arts & Design' },
  { code: 'OTHER', name: 'Other' },
] as const;

interface Institution {
  universityId: string;
  name: string;
}

/**
 * Finds the institution for an address, creating it if the domain is new.
 *
 * Uses the admin client because the caller is not yet signed in and cannot read
 * `university_domains` under RLS. It returns only the institution's identity —
 * never anything about other students.
 *
 * @param email - The validated, normalised address.
 * @returns The institution, or null when the domain is registered but marked as
 *          staff-only.
 */
async function resolveInstitution(email: string): Promise<Institution | null> {
  const domain = emailDomain(email);
  const admin = createAdminClient();

  const { data: known } = await admin
    .from('university_domains')
    .select('university_id, is_student_domain, universities(name)')
    .eq('domain', domain)
    .maybeSingle();

  if (known) {
    /*
     * An explicit is_student_domain = false outranks the general "any academic
     * address" rule. Some institutions publish a staff domain alongside the
     * student one, and a deliberate exclusion should not be undone by a
     * broader default.
     */
    if (!known.is_student_domain) {
      return null;
    }

    return {
      universityId: known.university_id,
      name: known.universities?.name ?? institutionNameFromDomain(domain),
    };
  }

  const name = institutionNameFromDomain(domain);

  const { data: university } = await admin
    .from('universities')
    .insert({ name, slug: slugFromDomain(domain) })
    .select('id')
    .single();

  if (!university) {
    return null;
  }

  await admin
    .from('university_domains')
    .insert({ domain, university_id: university.id, is_student_domain: true });

  await admin.from('degrees').insert(
    DEFAULT_DEGREES.map((degree) => ({
      university_id: university.id,
      name: degree.name,
      level: 'bachelors' as const,
    })),
  );

  /*
   * Re-read rather than trusting the row just written. If two students from the
   * same new domain sign up at the same moment, both reach this point and only
   * one insert wins; reading back means both end up in the same institution
   * instead of two parallel ones.
   */
  const { data: settled } = await admin
    .from('university_domains')
    .select('university_id, universities(name)')
    .eq('domain', domain)
    .maybeSingle();

  return settled
    ? { universityId: settled.university_id, name: settled.universities?.name ?? name }
    : { universityId: university.id, name };
}

/**
 * Creates an account for a student at an academic institution.
 *
 * The institution must exist before `signUp` is called, because the
 * `handle_new_user` database trigger resolves the university from the same
 * domain the instant the auth user is created.
 *
 * @param _previous - Previous form state, supplied by useActionState.
 * @param formData  - The submitted form.
 * @returns A failed ActionResult, or redirects to onboarding on success.
 */
export async function signUp(
  _previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  let verifyFor = '';

  try {
    const parsed = signUpSchema.parse({
      email: formData.get('email'),
      password: formData.get('password'),
    });

    const institution = await resolveInstitution(parsed.email);

    if (!institution) {
      return fail(
        ERROR_CODES.FORBIDDEN,
        'That address cannot be used to register. If it is a staff address, use your student one.',
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
       * Supabase reports an existing address as a generic failure so the form
       * cannot be used to discover who has an account. Keep that property.
       */
      return fail(
        ERROR_CODES.VALIDATION_FAILED,
        'That did not work. Check the address and password, or sign in instead.',
        'email',
      );
    }

    verifyFor = parsed.email;
  } catch (error) {
    return toActionError(error, 'auth.signUp');
  }

  /*
   * To the code screen, not to onboarding. With confirmations on, signUp leaves
   * the student with an account but no session — they are not signed in until
   * they prove they can read the address they registered with.
   */
  redirect(`/verify-email?email=${encodeURIComponent(verifyFor)}`);
}

/**
 * Completes a registration with the code from the email.
 *
 * @param _previous - Previous form state, supplied by useActionState.
 * @param formData  - The submitted form.
 * @returns A failed ActionResult, or redirects into onboarding on success.
 */
export async function verifyEmailCode(
  _previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const parsed = verificationCodeSchema.parse({
      email: formData.get('email'),
      code: formData.get('code'),
    });

    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email: parsed.email,
      token: parsed.code,
      type: 'signup',
    });

    if (error || !data.user) {
      /*
       * One message for a wrong code and an expired one. Distinguishing them
       * tells someone guessing which of their attempts was close.
       */
      return fail(
        ERROR_CODES.VALIDATION_FAILED,
        'That code did not work. It may have expired — send yourself a new one.',
        'code',
      );
    }
  } catch (error) {
    return toActionError(error, 'auth.verifyEmailCode');
  }

  /* verifyOtp signs them in, so they land in onboarding already authenticated. */
  redirect('/onboarding');
}

/**
 * Sends another sign-up code to an address that has not been confirmed yet.
 *
 * @param _previous - Previous form state, supplied by useActionState.
 * @param formData  - The submitted form.
 * @returns Whether it was sent.
 */
export async function resendVerificationCode(
  _previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const parsed = findAccountSchema.parse({ email: formData.get('email') });

    const supabase = await createClient();
    const { error } = await supabase.auth.resend({ type: 'signup', email: parsed.email });

    if (error) {
      /*
       * The rate limit is the usual reason, and it is worth saying plainly —
       * "that did not work" would have them pressing it again immediately.
       */
      return fail(
        ERROR_CODES.VALIDATION_FAILED,
        'Could not send another code just yet. Wait a moment and try again.',
      );
    }

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'auth.resendVerificationCode');
  }
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
      rememberMe: formData.get('rememberMe'),
    });

    /*
     * Recorded BEFORE signing in, because signInWithPassword is what writes the
     * auth cookies and createClient reads this to decide their lifetime. Setting
     * it afterwards would leave the first pair of cookies with the wrong one,
     * until some later request happened to rotate them.
     */
    const cookieStore = await cookies();
    cookieStore.set(REMEMBER_COOKIE, parsed.rememberMe ? 'true' : 'false', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: REMEMBER_COOKIE_MAX_AGE,
    });

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.email,
      password: parsed.password,
    });

    if (error || !data.user) {
      /*
       * An unconfirmed address is the one failure worth separating out. It is
       * not a wrong password, the student cannot fix it from this form, and it
       * leaks nothing they did not just prove they know — they got here by
       * registering. Everything else stays one message, so the form cannot be
       * used to enumerate who has an account.
       *
       * Set as a destination rather than redirected to on the spot: redirect()
       * works by throwing, and this catch would hand that to toActionError,
       * which would log it and answer "something went wrong".
       */
      if (error?.code === 'email_not_confirmed') {
        destination = `/verify-email?email=${encodeURIComponent(parsed.email)}`;
      } else {
        return fail(ERROR_CODES.UNAUTHENTICATED, 'Those details did not match an account.');
      }
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed_at')
        .eq('id', data.user.id)
        .maybeSingle();

      destination = profile?.onboarding_completed_at ? '/dashboard' : '/onboarding';
    }
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

/**
 * Starts the "I have forgotten my password" flow.
 *
 * ALWAYS REPORTS SUCCESS, including for an address with no account. The screen
 * that follows says "if that address has an account, a link is on its way",
 * which is true either way — answering honestly here would turn the form into a
 * way of asking whether a given classmate has registered.
 *
 * @param _previous - Previous form state, supplied by useActionState.
 * @param formData  - The submitted form.
 * @returns Success, once the attempt has been made.
 */
export async function requestPasswordReset(
  _previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const parsed = findAccountSchema.parse({ email: formData.get('email') });
    const origin = await requestOrigin();

    const supabase = await createClient();

    /*
     * The link lands on the callback, which trades the code for a session and
     * then sends them on to the form. It cannot point straight at
     * /reset-password: without that exchange there is no session, and
     * updateUser would have nobody to update.
     */
    await supabase.auth.resetPasswordForEmail(parsed.email, {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
    });

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'auth.requestPasswordReset');
  }
}

/**
 * Sets a new password for the student holding a recovery session.
 *
 * @param _previous - Previous form state, supplied by useActionState.
 * @param formData  - The submitted form.
 * @returns A failed ActionResult, or redirects to the dashboard on success.
 */
export async function resetPassword(
  _previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const parsed = newPasswordSchema.parse({
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
    });

    const supabase = await createClient();

    /*
     * The recovery link is the only thing standing behind this. Check it is
     * really there rather than trusting the page to have been reached properly
     * — a signed-out visitor typing the URL must not get a form that appears to
     * work and then fails at the last step.
     */
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return fail(
        ERROR_CODES.UNAUTHENTICATED,
        'That reset link has expired. Ask for a new one and try again.',
      );
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.password });

    if (error) {
      return fail(
        ERROR_CODES.VALIDATION_FAILED,
        error.message || 'That password was not accepted. Try a different one.',
        'password',
      );
    }
  } catch (error) {
    return toActionError(error, 'auth.resetPassword');
  }

  redirect('/dashboard');
}

/**
 * Changes the password of a student who is already signed in.
 *
 * THE CURRENT PASSWORD IS CHECKED, and Supabase does not check it for us —
 * updateUser will happily rewrite the password of whoever holds the session.
 * Without this an unattended laptop is enough to take an account permanently,
 * which is the thing a password change is supposed to prevent.
 *
 * @param _previous - Previous form state, supplied by useActionState.
 * @param formData  - The submitted form.
 * @returns Whether the password was changed.
 */
export async function changePassword(
  _previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();

    const parsed = changePasswordSchema.parse({
      currentPassword: formData.get('currentPassword'),
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
    });

    if (!user.email) {
      return fail(ERROR_CODES.FORBIDDEN, 'This account has no email address to verify against.');
    }

    /* Checked on a throwaway client — see credential-check.ts for why. */
    if (!(await isCurrentPassword(user.email, parsed.currentPassword))) {
      return fail(
        ERROR_CODES.UNAUTHENTICATED,
        'That is not your current password.',
        'currentPassword',
      );
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password: parsed.password });

    if (error) {
      return fail(
        ERROR_CODES.VALIDATION_FAILED,
        error.message || 'That password was not accepted. Try a different one.',
        'password',
      );
    }

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'auth.changePassword');
  }
}

/**
 * Deletes the caller's account, their data, and their auth record.
 *
 * THE AUTH RECORD GOES LAST AND VIA THE ADMIN CLIENT, because there is no other
 * way: a student holds the anon key, and the anon key cannot delete from
 * auth.users. Everything they own in `public` hangs off `profiles.id` with
 * `on delete cascade`, and `profiles.id` references `auth.users(id)` the same
 * way — so removing the auth row is what actually clears the data, and doing it
 * last means a failure part-way through leaves an account that still works
 * rather than a signed-in student with nothing behind them.
 *
 * @param _previous - Previous form state, supplied by useActionState.
 * @param formData  - The submitted form, carrying the typed confirmation.
 * @returns A failed ActionResult, or redirects to the landing page.
 */
export async function deleteAccount(
  _previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();

    /*
     * Typed confirmation, checked on the server. The dialog asks for it too,
     * but a disabled button is a suggestion and this is not undoable.
     */
    if (formData.get('confirmation') !== 'DELETE') {
      return fail(
        ERROR_CODES.VALIDATION_FAILED,
        'Type DELETE to confirm.',
        'confirmation',
      );
    }

    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);

    if (error) {
      return fail(
        ERROR_CODES.UNEXPECTED,
        'Your account could not be deleted. Nothing has been removed — please try again.',
      );
    }

    /* The session outlives the user it belonged to; clear it explicitly. */
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (error) {
    return toActionError(error, 'auth.deleteAccount');
  }

  redirect('/');
}
