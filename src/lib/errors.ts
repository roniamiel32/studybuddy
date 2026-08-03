/**
 * File:        src/lib/errors.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The application's error contract. Server actions never throw
 *              across the client boundary — they return a discriminated
 *              ActionResult, so the UI handles failure as data instead of
 *              relying on an error boundary. Internal detail is deliberately
 *              kept out of anything returned to the client.
 * Version:     0.2.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Initial implementation (Phase 0.5 scaffold)
 */

import { z } from 'zod';

/**
 * Stable, machine-readable error codes. The UI switches on these; the
 * accompanying message is for humans and may change freely.
 */
export const ERROR_CODES = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  ONBOARDING_INCOMPLETE: 'ONBOARDING_INCOMPLETE',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  UNEXPECTED: 'UNEXPECTED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ActionError {
  code: ErrorCode;
  message: string;
  /** Field name when the error belongs to one form input. */
  field?: string;
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError };

/**
 * An error that is safe to show to the user.
 *
 * Anything thrown that is *not* an AppError is treated as unexpected and
 * reduced to a generic message, so a database constraint name or stack trace
 * cannot leak into the UI.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly field?: string;

  /**
   * @param code    - Stable error code the UI can switch on.
   * @param message - User-facing description. Must not contain internal detail.
   * @param field   - Optional form field the error belongs to.
   */
  constructor(code: ErrorCode, message: string, field?: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.field = field;
  }
}

/**
 * Wraps a value in a successful result.
 *
 * @param data - The payload to return to the caller.
 * @returns A successful ActionResult carrying `data`.
 */
export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

/**
 * Builds a failed result.
 *
 * @param code    - Stable error code.
 * @param message - User-facing message.
 * @param field   - Optional offending form field.
 * @returns A failed ActionResult.
 */
export function fail<T = never>(
  code: ErrorCode,
  message: string,
  field?: string,
): ActionResult<T> {
  return { ok: false, error: { code, message, field } };
}

/**
 * Converts a thrown value into a client-safe failed result.
 *
 * Zod errors become field-scoped validation failures; AppErrors pass through
 * with their code and message intact; everything else is logged server-side
 * and reduced to a generic UNEXPECTED error so internal detail stays internal.
 *
 * @param error   - The value caught in a `catch` block.
 * @param context - Short label identifying the call site, used in the log line.
 * @returns A failed ActionResult that is safe to send to the browser.
 */
export function toActionError<T = never>(error: unknown, context: string): ActionResult<T> {
  if (error instanceof AppError) {
    return fail(error.code, error.message, error.field);
  }

  if (error instanceof z.ZodError) {
    const first = error.issues[0];
    return fail(
      ERROR_CODES.VALIDATION_FAILED,
      first?.message ?? 'Some of the details you entered are not valid.',
      first?.path.join('.') || undefined,
    );
  }

  console.error(`[${context}] unexpected error:`, error);

  return fail(
    ERROR_CODES.UNEXPECTED,
    'Something went wrong on our side. Please try again.',
  );
}

/**
 * Narrowing helper for callers that only care about the happy path.
 *
 * @param result - The result to inspect.
 * @returns True when the result succeeded, narrowing the type accordingly.
 */
export function isOk<T>(result: ActionResult<T>): result is { ok: true; data: T } {
  return result.ok;
}
