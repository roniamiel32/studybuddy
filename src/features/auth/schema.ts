/**
 * File:        src/features/auth/schema.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Validation for the credential forms. Shared by the client form
 *              and the server action, so the rules cannot drift apart — the
 *              client copy is for fast feedback, the server copy is the one
 *              that is actually enforced.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import { z } from 'zod';

/**
 * Minimum password length.
 *
 * Stricter than the Supabase project setting of 6 on purpose: the shorter limit
 * is the platform's floor, not a recommendation, and rejecting a weak password
 * before it is ever sent is better than after.
 */
export const MIN_PASSWORD_LENGTH = 8;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, 'Enter your university email address.')
  .pipe(z.email('That does not look like an email address.'));

export const signUpSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
    .max(72, 'Passwords are limited to 72 characters.'),
});

export const signInSchema = z.object({
  email: emailSchema,
  /*
   * No length rule on sign-in. Validating an existing password's format tells
   * an attacker which rules were in force when the account was created, and
   * annoys a legitimate user whose password predates a rule change.
   */
  password: z.string().min(1, 'Enter your password.'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

/**
 * Extracts the domain from an email address.
 *
 * @param email - A validated address.
 * @returns The lowercase domain, or an empty string when there is no '@'.
 */
export function emailDomain(email: string): string {
  return email.trim().toLowerCase().split('@')[1] ?? '';
}
