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

describe('icebreakerReplySchema', () => {
  it('accepts a short reply and trims it', () => {
    const parsed = icebreakerReplySchema.parse({ message: '  Hey! Want to study?  ' });

    expect(parsed.message).toBe('Hey! Want to study?');
  });

  it('rejects an empty or near-empty message', () => {
    expect(() => icebreakerReplySchema.parse({ message: '' })).toThrow();
    expect(() => icebreakerReplySchema.parse({ message: 'ok' })).toThrow();
  });

  it('rejects an essay, which is not an icebreaker', () => {
    expect(() => icebreakerReplySchema.parse({ message: 'a'.repeat(401) })).toThrow();
  });

  it('rejects a reply with no message field at all', () => {
    expect(() => icebreakerReplySchema.parse({ text: 'wrong key' })).toThrow();
  });
});

describe('fallbackIcebreaker', () => {
  it('names the shared course and the shared preference', () => {
    const message = fallbackIcebreaker(context());

    expect(message).toContain('Tamar');
    expect(message).toContain('Algorithms');
    expect(message).toContain('both prefer mornings');
  });

  it('still works with a course but no shared preference', () => {
    const message = fallbackIcebreaker(context({ sharedPreferences: [] }));

    expect(message).toContain('Algorithms');
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

describe('sharedPreferenceNotes', () => {
  const mine = {
    preferredTimeBlocks: ['morning', 'evening'],
    studyEnvironments: ['quiet'],
    groupSizes: ['small'],
  };

  it('describes an overlap in words a student would use', () => {
    const notes = sharedPreferenceNotes(mine, {
      preferredTimeBlocks: ['morning'],
      studyEnvironments: ['quiet'],
      groupSizes: ['small'],
    });

    expect(notes).toContain('both prefer mornings');
    expect(notes).toContain('both like studying quietly');
    expect(notes).toContain('both prefer small groups');
  });

  it('says nothing when nothing overlaps', () => {
    /* Better silence than a claim about something they do not share. */
    const notes = sharedPreferenceNotes(mine, {
      preferredTimeBlocks: ['noon'],
      studyEnvironments: ['discussion'],
      groupSizes: ['large'],
    });

    expect(notes).toEqual([]);
  });

  it('joins two shared times readably', () => {
    const notes = sharedPreferenceNotes(mine, {
      preferredTimeBlocks: ['morning', 'evening'],
      studyEnvironments: [],
      groupSizes: [],
    });

    expect(notes[0]).toBe('both prefer mornings and evenings');
  });

  it('survives a value it has no wording for', () => {
    /* An enum can gain a value before this mapping does; the note should degrade
       to the raw value rather than printing "undefined". */
    const notes = sharedPreferenceNotes(
      { preferredTimeBlocks: ['dawn'], studyEnvironments: [], groupSizes: [] },
      { preferredTimeBlocks: ['dawn'], studyEnvironments: [], groupSizes: [] },
    );

    expect(notes[0]).toBe('both prefer dawn');
  });

  it('handles a student who has answered nothing', () => {
    const notes = sharedPreferenceNotes(
      { preferredTimeBlocks: [], studyEnvironments: [], groupSizes: [] },
      mine,
    );

    expect(notes).toEqual([]);
  });
});

describe('sendMessageSchema', () => {
  const conversationId = '0e1d4a2b-0000-4000-8000-000000000001';

  it('trims before measuring, so whitespace is not a message', () => {
    /* The database CHECK measures btrim(body) too — the two must agree about
       what counts as empty. */
    expect(() => sendMessageSchema.parse({ conversationId, body: '    ' })).toThrow();
  });

  it('keeps the text a student typed', () => {
    const parsed = sendMessageSchema.parse({ conversationId, body: '  See you at 10  ' });

    expect(parsed.body).toBe('See you at 10');
  });

  it('rejects a body past the database limit', () => {
    expect(() => sendMessageSchema.parse({ conversationId, body: 'x'.repeat(2001) })).toThrow();
  });

  it('rejects a conversation id that is not a uuid', () => {
    expect(() => sendMessageSchema.parse({ conversationId: 'mine', body: 'hi' })).toThrow();
  });
});
