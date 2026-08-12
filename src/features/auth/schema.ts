/**
 * File:        src/features/auth/schema.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Validation for the credential forms. Shared by the client form
 *              and the server action, so the rules cannot drift apart — the
 *              client copy is for fast feedback, the server copy is the one
 *              that is actually enforced.
 * Version:     0.6.1
 *
 * Modifications:
 *     0.23.0 - 2026-08-12 - Remember me, verification codes, password changes
 *                           (Phase 9A)
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 *     0.6.1 - 2026-08-05 - Accept any .ac.il or .edu address, not only seeded
 *                          domains
 */

import { z } from 'zod';

import { ACADEMIC_SUFFIXES, isAcademicEmail, normaliseEmail } from './academic-email';

/**
 * Minimum password length.
 *
 * Stricter than the Supabase project setting of 6 on purpose: the shorter limit
 * is the platform's floor, not a recommendation, and rejecting a weak password
 * before it is ever sent is better than after.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Human-readable list for error messages: ".ac.il or .edu". */
const SUFFIX_LIST = ACADEMIC_SUFFIXES.join(' or ');

/**
 * A university address.
 *
 * Normalisation happens before the format check, so trailing spaces and stray
 * capitals never reach the domain comparison.
 */
export const emailSchema = z
  .string()
  .transform(normaliseEmail)
  .pipe(z.email('That does not look like an email address.'))
  .refine(isAcademicEmail, `Use your university address — one ending in ${SUFFIX_LIST}.`);

export const signUpSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(72, 'Passwords are limited to 72 characters.'),
});

/**
 * A checkbox, as a form sends it.
 *
 * An unticked checkbox is not submitted at all, so the field arrives as null
 * rather than as "false" — which is why this coerces from presence rather than
 * parsing a boolean.
 */
const checkboxSchema = z.preprocess((value) => value === 'on' || value === 'true', z.boolean());

export const signInSchema = z.object({
  /*
   * Sign-in normalises but does not require an academic suffix. Someone with an
   * existing account should be able to get back in even if the rules about
   * which addresses may register have changed since.
   */
  email: z.string().transform(normaliseEmail).pipe(z.email('That does not look like an email address.')),
  /*
   * No length rule on sign-in. Validating an existing password's format tells
   * an attacker which rules were in force when the account was created, and
   * annoys a legitimate user whose password predates a rule change.
   */
  password: z.string().min(1, 'Enter your password.'),
  rememberMe: checkboxSchema,
});

/** The address, on its own — "find your account" and resending a code. */
export const findAccountSchema = z.object({ email: emailSchema });

/**
 * The six digits from the sign-up email.
 *
 * Spaces are stripped before the length check because people paste codes out of
 * emails with them attached, and rejecting "123 456" teaches nothing.
 */
export const verificationCodeSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .transform((value) => value.replace(/\s/g, ''))
    .pipe(z.string().regex(/^\d{6}$/, 'Enter the six-digit code from your email.')),
});

/**
 * A new password, typed twice.
 *
 * The match is checked here rather than in the form so the rule cannot be got
 * round, and reported against the second field because that is the one the
 * student should retype.
 */
export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      .max(72, 'Passwords are limited to 72 characters.'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Those two passwords are not the same.',
    path: ['confirmPassword'],
  });

/** Changing a password from inside the app, where the old one is known. */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      .max(72, 'Passwords are limited to 72 characters.'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Those two passwords are not the same.',
    path: ['confirmPassword'],
  })
  .refine((values) => values.password !== values.currentPassword, {
    message: 'That is the password you are already using.',
    path: ['password'],
  });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type NewPasswordInput = z.infer<typeof newPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export { emailDomain, isAcademicEmail, nameFromEmail, normaliseEmail } from './academic-email';
