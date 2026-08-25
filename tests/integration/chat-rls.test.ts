/**
 * File:        tests/integration/chat-rls.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The security proof for Phase 3's conversations.
 *
 *              A private message is the most sensitive thing this product
 *              stores, and its access rule is stricter than anywhere else in the
 *              app: not "your university" — every classmate shares that — but
 *              "you are one of exactly two people". This suite attacks that rule
 *              from every angle a real student could: an outsider reading the
 *              thread, an outsider writing into it, a participant forging a
 *              message as the other person, a participant editing what was said,
 *              and a sender marking their own message read to fake a receipt.
 *
 *              Every test runs as a REAL SIGNED-IN STUDENT. The service role
 *              bypasses RLS, so a suite built on it would pass no matter how the
 *              policies were written.
 * Version:     0.12.0
 *
 * Modifications:
 *     0.12.0 - 2026-08-10 - Initial policy tests (Phase 3)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';
import {
  RUNI_CURRENT_TERM_ID,
  RUNI_ID,
  adminDb,
  createStudent,
  deleteStudents,
  hasLocalDb,
  offeringIdByCode,
  signInAs,
} from './helpers/db';

const describeDb = hasLocalDb() ? describe : describe.skip;

if (!hasLocalDb()) {
  console.warn('Skipping chat RLS tests: run `npm run db:start` and populate .env.local.');
}

/** Postgres "insufficient privilege" — what a blocked write returns. */
const RLS_DENIED = '42501';

describeDb('Conversations and messages: Row Level Security', () => {
  const admin = hasLocalDb() ? adminDb() : null!;
  const stamp = Math.random().toString(36).slice(2, 8);

  const emails = {
    /* The two people in the conversation. */
    alice: `chat-alice-${stamp}@post.runi.ac.il`,
    bob: `chat-bob-${stamp}@post.runi.ac.il`,
    /* A classmate at the SAME university who is not in it. The important case:
       every tenant check in the app passes for them, and they must still see
       nothing. */
    outsider: `chat-outsider-${stamp}@post.runi.ac.il`,
    /* The other tenant. */
    tau: `chat-tau-${stamp}@mail.tau.ac.il`,
  };

  const ids: Record<keyof typeof emails, string> = {
    alice: '',
    bob: '',
    outsider: '',
    tau: '',
  };

  let alice: SupabaseClient<Database>;
  let bob: SupabaseClient<Database>;
  let outsider: SupabaseClient<Database>;
  let tau: SupabaseClient<Database>;

  let conversationId = '';
  let aliceMessageId = '';
  let runiOfferingId = '';

  beforeAll(async () => {
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      ids[key] = await createStudent(admin, emails[key]);
    }

    runiOfferingId = await offeringIdByCode(admin, 'CS-3040', RUNI_CURRENT_TERM_ID);

    /*
     * Everyone shares the course, so app_can_see_profile passes for all of them.
     * That is deliberate: it means the tests below are exercising the
     * participation rule, not accidentally passing because the outsider could
     * not see Alice or Bob in the first place.
     */
    await admin.from('enrollments').insert([
      { profile_id: ids.alice, course_offering_id: runiOfferingId, university_id: RUNI_ID },
      { profile_id: ids.bob, course_offering_id: runiOfferingId, university_id: RUNI_ID },
      { profile_id: ids.outsider, course_offering_id: runiOfferingId, university_id: RUNI_ID },
    ]);

    alice = await signInAs(emails.alice);
    bob = await signInAs(emails.bob);
    outsider = await signInAs(emails.outsider);
    tau = await signInAs(emails.tau);

    /* Created by Alice as herself, so the insert policy is exercised too. */
    const created = await alice
      .from('conversations')
      .insert({
        participant_a: ids.alice,
        participant_b: ids.bob,
        university_id: RUNI_ID,
        course_offering_id: runiOfferingId,
      })
      .select('id')
      .single();

    if (created.error) {
      throw new Error(`conversation seed failed: ${created.error.message}`);
    }
    conversationId = created.data.id;

    const message = await alice
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: ids.alice,
        body: 'Hi Bob, want to revise CS-3040 together?',
      })
      .select('id')
      .single();

    if (message.error) {
      throw new Error(`message seed failed: ${message.error.message}`);
    }
    aliceMessageId = message.data.id;
  }, 60_000);

  afterAll(async () => {
    await deleteStudents(admin, Object.values(ids));
  });

  // ===========================================================================
  // The headline claim.
  // ===========================================================================

  describe('only the two participants can reach a conversation', () => {
    it('lets both participants read it', async () => {
      const fromAlice = await alice.from('conversations').select('id').eq('id', conversationId);
      const fromBob = await bob.from('conversations').select('id').eq('id', conversationId);

      expect(fromAlice.data).toHaveLength(1);
      expect(fromBob.data).toHaveLength(1);
    });

    it('hides it from a classmate at the same university', async () => {
      /*
       * The test that matters most. The outsider shares the course, shares the
       * university, and can see both students on the matches screen — every
       * check the rest of the app makes would pass for them.
       */
      const { data, error } = await outsider
        .from('conversations')
        .select('id')
        .eq('id', conversationId);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('hides it from a student at another university', async () => {
      const { data } = await tau.from('conversations').select('id').eq('id', conversationId);

      expect(data).toHaveLength(0);
    });

    it('shows a student nothing when they have no conversations', async () => {
      const { data } = await outsider.from('conversations').select('id');

      expect(data).toHaveLength(0);
    });
  });

  describe('only the two participants can read the messages', () => {
    it('lets the recipient read what was sent', async () => {
      const { data } = await bob
        .from('messages')
        .select('id, body')
        .eq('conversation_id', conversationId);

      expect(data).toHaveLength(1);
      expect(data![0].body).toContain('CS-3040');
    });

    it('returns nothing to an outsider who names the conversation directly', async () => {
      const { data, error } = await outsider
        .from('messages')
        .select('id, body')
        .eq('conversation_id', conversationId);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('returns nothing to an outsider who names the message id directly', async () => {
      /* Knowing the id must not be enough — the policy is on participation. */
      const { data } = await outsider.from('messages').select('id').eq('id', aliceMessageId);

      expect(data).toHaveLength(0);
    });

    it('returns nothing to an outsider asking for every message in the table', async () => {
      const { data } = await outsider.from('messages').select('id');

      expect(data).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Writes.
  // ===========================================================================

  describe('a non-participant cannot write into a conversation', () => {
    it('refuses an outsider sending a message', async () => {
      const { error } = await outsider.from('messages').insert({
        conversation_id: conversationId,
        sender_id: ids.outsider,
        body: 'Let me in',
      });

      expect(error?.code).toBe(RLS_DENIED);
    });

    it('refuses an outsider adding themselves to the conversation', async () => {
      /* No UPDATE policy on conversations at all, so the participants are fixed. */
      const { error } = await outsider
        .from('conversations')
        .update({ participant_b: ids.outsider })
        .eq('id', conversationId);

      expect(error?.code).toBe(RLS_DENIED);
    });

    it('refuses a conversation the caller is not in', async () => {
      const { error } = await outsider.from('conversations').insert({
        participant_a: ids.alice,
        participant_b: ids.bob,
        university_id: RUNI_ID,
      });

      expect(error).not.toBeNull();
    });

    it('refuses a conversation across two universities', async () => {
      const { error } = await alice.from('conversations').insert({
        participant_a: ids.alice,
        participant_b: ids.tau,
        university_id: RUNI_ID,
      });

      expect(error).not.toBeNull();
    });
  });

  describe('a participant cannot forge or rewrite a message', () => {
    it('refuses Bob sending a message attributed to Alice', async () => {
      /*
       * Bob may legitimately write into this conversation, which is what makes
       * this the sharp case: the only thing standing between him and a message in
       * Alice's name is `sender_id = auth.uid()`.
       */
      const { error } = await bob.from('messages').insert({
        conversation_id: conversationId,
        sender_id: ids.alice,
        body: 'I will do all the work, signed Alice',
      });

      expect(error?.code).toBe(RLS_DENIED);
    });

    it('refuses Bob editing what Alice said', async () => {
      const { error } = await bob
        .from('messages')
        .update({ body: 'something Alice never wrote' })
        .eq('id', aliceMessageId);

      /* The freeze trigger, not the policy: Bob is allowed to UPDATE this row to
         mark it read, so only the trigger can stop him changing the words. */
      expect(error?.code).toBe(RLS_DENIED);

      const { data } = await bob.from('messages').select('body').eq('id', aliceMessageId).single();
      expect(data!.body).toContain('CS-3040');
    });

    it('refuses Alice editing her own message after sending', async () => {
      /*
       * Denied SILENTLY, and the assertion has to account for that. The UPDATE
       * policy only covers messages the caller did NOT send, so Alice's own row
       * fails the USING clause, matches nothing, and Postgres reports success on
       * zero rows rather than an error. Asserting "an error came back" would pass
       * here for the wrong reason and keep passing if the policy were loosened —
       * so the test asserts no row changed and the words are still hers.
       */
      const { data, error } = await alice
        .from('messages')
        .update({ body: 'actually, never mind' })
        .eq('id', aliceMessageId)
        .select('id');

      expect(error).toBeNull();
      expect(data ?? []).toHaveLength(0);

      const after = await alice
        .from('messages')
        .select('body')
        .eq('id', aliceMessageId)
        .single();
      expect(after.data!.body).toContain('CS-3040');
    });

    it('refuses deleting a message, which no student may do', async () => {
      /* No DELETE grant: a thread is a shared record, so one side erasing part of
         it would rewrite the other side's history. */
      const { error } = await alice.from('messages').delete().eq('id', aliceMessageId);

      expect(error).not.toBeNull();
    });
  });

  // ===========================================================================
  // Read receipts.
  // ===========================================================================

  describe('is_read can only be set by the recipient', () => {
    it('refuses the sender marking their own message read', async () => {
      /*
       * Two things would break if this were allowed: Alice could clear her own
       * badge without reading anything, and she could tell Bob his message had
       * been seen when it had not.
       */
      /* Zero rows rather than an error — see the note on Alice editing her own
         message. What matters is that the flag did not move. */
      const { data: updated, error } = await alice
        .from('messages')
        .update({ is_read: true })
        .eq('id', aliceMessageId)
        .select('id');

      expect(error).toBeNull();
      expect(updated ?? []).toHaveLength(0);

      const { data } = await alice.from('messages').select('is_read').eq('id', aliceMessageId).single();
      expect(data!.is_read).toBe(false);
    });

    it('lets the recipient mark it read, and stamps the time', async () => {
      const { error } = await bob
        .from('messages')
        .update({ is_read: true })
        .eq('id', aliceMessageId);

      expect(error).toBeNull();

      const { data } = await bob
        .from('messages')
        .select('is_read, read_at')
        .eq('id', aliceMessageId)
        .single();

      expect(data!.is_read).toBe(true);
      /* Set by the trigger, never by the application. */
      expect(data!.read_at).not.toBeNull();
    });

    it('refuses an outsider marking a message read', async () => {
      const { data } = await outsider
        .from('messages')
        .update({ is_read: true })
        .eq('id', aliceMessageId)
        .select('id');

      /* No error, no rows: the row is invisible, so there is nothing to update. */
      expect(data ?? []).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Invariants that are not access control but would corrupt the feature.
  // ===========================================================================

  describe('conversation integrity', () => {
    it('refuses a conversation with yourself', async () => {
      const { error } = await alice.from('conversations').insert({
        participant_a: ids.alice,
        participant_b: ids.alice,
        university_id: RUNI_ID,
      });

      expect(error).not.toBeNull();
    });

    it('refuses a second conversation between the same pair, in either direction', async () => {
      /* Both students pressing "Send message" at once must not create two
         threads, each holding half the exchange. */
      const sameOrder = await alice.from('conversations').insert({
        participant_a: ids.alice,
        participant_b: ids.bob,
        university_id: RUNI_ID,
      });
      expect(sameOrder.error).not.toBeNull();

      const reversed = await bob.from('conversations').insert({
        participant_a: ids.bob,
        participant_b: ids.alice,
        university_id: RUNI_ID,
      });
      expect(reversed.error).not.toBeNull();
    });

    it('refuses an empty message', async () => {
      const { error } = await alice.from('messages').insert({
        conversation_id: conversationId,
        sender_id: ids.alice,
        body: '   ',
      });

      expect(error).not.toBeNull();
    });

    it('moves the conversation to the top of the list when a message arrives', async () => {
      const before = await bob
        .from('conversations')
        .select('last_message_at')
        .eq('id', conversationId)
        .single();

      await bob.from('messages').insert({
        conversation_id: conversationId,
        sender_id: ids.bob,
        body: 'Yes, when are you free?',
      });

      const after = await bob
        .from('conversations')
        .select('last_message_at')
        .eq('id', conversationId)
        .single();

      expect(new Date(after.data!.last_message_at).getTime()).toBeGreaterThan(
        new Date(before.data!.last_message_at).getTime(),
      );
    });

    it('counts unread messages only from the other person', async () => {
      /*
       * What the navigation badge reads. Bob has just sent a message and read
       * Alice's, so his own unread count must be zero — a badge that counts your
       * own sent messages never clears.
       */
      const { count } = await bob
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
        .neq('sender_id', ids.bob);

      expect(count).toBe(0);

      /* Alice, meanwhile, has one unread message waiting from Bob. */
      const alicePending = await alice
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
        .neq('sender_id', ids.alice);

      expect(alicePending.count).toBe(1);
    });
  });
});
