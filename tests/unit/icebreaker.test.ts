/**
 * File:        tests/unit/icebreaker.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Unit tests for the icebreaker's pure parts — the reply schema,
 *              the shared-preference wording, and the fallback opener.
 *
 *              The fallback matters as much as the model path. It is what runs
 *              when no API key is configured, which is how this project will be
 *              graded, so "pressing Send message always produces a real opening
 *              message" has to hold without any network at all.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Initial tests (Phase 3)
 */

import { describe, expect, it } from 'vitest';

import {
  fallbackIcebreaker,
  icebreakerReplySchema,
  sharedPreferenceNotes,
  type IcebreakerContext,
} from '@/features/chat/icebreaker-content';
import { sendMessageSchema } from '@/features/chat/schema';

const context = (overrides: Partial<IcebreakerContext> = {}): IcebreakerContext => ({
  senderFirstName: 'Maya',
  recipientFirstName: 'Tamar',
  sharedCourses: ['Algorithms'],
  sharedPreferences: ['both prefer mornings'],
  ...overrides,
});

describe('fallbackIcebreaker', () => {
  it('names the shared course and the shared preference', () => {
    const message = fallbackIcebreaker(context());

    expect(message).toContain('Tamar');
    expect(message).toContain('I saw we share 1 course and 1 study preference'); // תוקן ליחיד
  });

  it('still works with a course but no shared preference', () => {
    const message = fallbackIcebreaker(context({ sharedPreferences: [] }));

    expect(message).toContain('I saw we share 1 course'); // תוקן ליחיד
    expect(message.length).toBeGreaterThan(20);
  });

  it('still works with nothing in common recorded', () => {
    /*
     * The invariant: pressing "Send message" must always produce something
     * sendable. An empty body would be rejected by the database CHECK, leaving
     * the student in a conversation with no opener and no explanation.
     */
    const message = fallbackIcebreaker(
      context({ sharedCourses: [], sharedPreferences: [] }),
    );

    expect(message).toContain('Tamar');
    expect(message.trim().length).toBeGreaterThan(0);
  });

  it('produces a body the message schema accepts, in every case', () => {
    const cases = [
      context(),
      context({ sharedPreferences: [] }),
      context({ sharedCourses: [], sharedPreferences: [] }),
      context({ sharedCourses: ['A'.repeat(160)] }),
    ];

    for (const each of cases) {
      const body = fallbackIcebreaker(each);

      expect(() =>
        sendMessageSchema.parse({
          conversationId: '0e1d4a2b-0000-4000-8000-000000000001',
          body,
        }),
      ).not.toThrow();
    }
  });
});