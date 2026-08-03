/**
 * File:        tests/unit/errors.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Unit tests for the ActionResult error contract. The security
 *              property under test is that an unexpected error never leaks its
 *              internal message to the client.
 * Version:     0.2.0
 *
 * Modifications:
 *     0.2.0 - 2026-08-03 - Initial tests (Phase 0.5 scaffold)
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  AppError,
  ERROR_CODES,
  fail,
  isOk,
  ok,
  toActionError,
} from '@/lib/errors';

describe('result constructors', () => {
  it('wraps a payload in a successful result', () => {
    expect(ok({ id: 7 })).toEqual({ ok: true, data: { id: 7 } });
  });

  it('builds a failed result carrying the offending field', () => {
    expect(fail(ERROR_CODES.VALIDATION_FAILED, 'Phone number is not valid.', 'phone')).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Phone number is not valid.',
        field: 'phone',
      },
    });
  });

  it('narrows the type through isOk', () => {
    const result = ok('hello');

    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      // Compiles only if the guard narrows correctly.
      expect(result.data.toUpperCase()).toBe('HELLO');
    }
  });
});

describe('toActionError', () => {
  it('passes an AppError through with its code, message and field intact', () => {
    const error = new AppError(ERROR_CODES.FORBIDDEN, 'That request is not yours.', 'requestId');

    expect(toActionError(error, 'test')).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.FORBIDDEN,
        message: 'That request is not yours.',
        field: 'requestId',
      },
    });
  });

  it('maps a Zod error to a field-scoped validation failure', () => {
    const schema = z.object({ fullName: z.string().min(2, 'Name is too short.') });
    const parsed = schema.safeParse({ fullName: 'R' });

    const result = toActionError(parsed.error, 'test');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ERROR_CODES.VALIDATION_FAILED);
      expect(result.error.message).toBe('Name is too short.');
      expect(result.error.field).toBe('fullName');
    }
  });

  it('does not leak the message of an unexpected error to the client', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const leaky = new Error(
      'duplicate key value violates unique constraint "one_live_request_per_pair_per_course"',
    );

    const result = toActionError(leaky, 'requests.send');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ERROR_CODES.UNEXPECTED);
      expect(result.error.message).toBe('Something went wrong on our side. Please try again.');
      expect(result.error.message).not.toContain('unique constraint');
    }

    // The detail must still reach the server log, tagged with its call site.
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.[0]).toContain('requests.send');

    spy.mockRestore();
  });

  it('handles a thrown non-Error value without crashing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = toActionError('just a string', 'test');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ERROR_CODES.UNEXPECTED);
    }

    spy.mockRestore();
  });
});

describe('AppError', () => {
  it('is an Error with a stable name, so instanceof checks survive bundling', () => {
    const error = new AppError(ERROR_CODES.RATE_LIMITED, 'Slow down.');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
    expect(error.code).toBe(ERROR_CODES.RATE_LIMITED);
    expect(error.field).toBeUndefined();
  });
});
