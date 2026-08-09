/**
 * File:        src/features/auth/actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Email + password authentication. Any academic address is
 *              accepted; the domain decides which institution the student
 *              belongs to, and an institution is created on first sight if it
 *              is not already known.
 * Version:     0.6.1
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 *     0.6.1 - 2026-08-05 - Accept any .ac.il / .edu address, provisioning the
 *                          institution when the domain is new
 */

'use server';

import { redirect } from 'next/navigation';

import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

import { emailDomain, institutionNameFromDomain, slugFromDomain } from './academic-email';
import { signInSchema, signUpSchema } from './schema';

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

  /*
   * Degrees first, then one track per degree. A track's degree_id is NOT NULL,
   * so the order matters — and the inserted ids have to be read back rather
   * than assumed, since they are generated.
   */
  const { data: degrees } = await admin
    .from('degrees')
    .insert(
      DEFAULT_DEGREES.map((degree) => ({
        university_id: university.id,
        name: degree.name,
        level: 'bachelors' as const,
      })),
    )
    .select('id, name');

  if (degrees) {
    await admin.from('study_tracks').insert(
      degrees.map((degree) => ({
        university_id: university.id,
        degree_id: degree.id,
        code:
          DEFAULT_DEGREES.find((candidate) => candidate.name === degree.name)?.code ??
          degree.name.slice(0, 8).toUpperCase(),
        name: degree.name,
      })),
    );
  }

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
  let shouldRedirect = false;

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
