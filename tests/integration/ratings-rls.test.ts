/**
 * File:        tests/integration/ratings-rls.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The security proof for Phase 6's ratings.
 *
 *              THE PROMISE UNDER TEST: a negative rating is visible to nobody but
 *              its author — not the person rated, not a classmate, not another
 *              rater — while still changing who gets matched. Everything else in
 *              this suite is secondary to that.
 *
 *              It is worth being explicit about why this needs its own suite rather
 *              than a UI test. "Only positive connections are publicly displayed"
 *              is a promise to the person being rated. A promise kept by a WHERE
 *              clause in one query is one refactor away from being broken silently;
 *              a promise kept by a SELECT policy cannot be broken by adding a
 *              feature. These tests assert the second kind.
 *
 *              Every test runs as a REAL SIGNED-IN STUDENT. The service role
 *              bypasses RLS, so a suite built on it would pass regardless.
 * Version:     0.18.0
 *
 * Modifications:
 *     0.18.0 - 2026-08-10 - Initial policy tests (Phase 6)
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
  seedCompletedMeeting,
  signInAs,
} from './helpers/db';

const describeDb = hasLocalDb() ? describe : describe.skip;

if (!hasLocalDb()) {
  console.warn('Skipping rating RLS tests: run `npm run db:start` and populate .env.local.');
}

/** Postgres "insufficient privilege" — what a blocked write returns. */
const RLS_DENIED = '42501';

describeDb('Study ratings: Row Level Security', () => {
  const admin = hasLocalDb() ? adminDb() : null!;
  const stamp = Math.random().toString(36).slice(2, 8);

  const emails = {
    /* Gives both ratings. */
    rater: `rate-rater-${stamp}@post.runi.ac.il`,
    /* Rated positively — it should show on their profile. */
    liked: `rate-liked-${stamp}@post.runi.ac.il`,
    /* Rated negatively — they must never learn this. */
    disliked: `rate-disliked-${stamp}@post.runi.ac.il`,
    /* A classmate with no part in any of it. */
    bystander: `rate-bystander-${stamp}@post.runi.ac.il`,
  };

  const ids: Record<keyof typeof emails, string> = {
    rater: '',
    liked: '',
    disliked: '',
    bystander: '',
  };

  let rater: SupabaseClient<Database>;
  let liked: SupabaseClient<Database>;
  let disliked: SupabaseClient<Database>;
  let bystander: SupabaseClient<Database>;

  let offeringId = '';
  const conversationIds: Record<string, string> = {};

  beforeAll(async () => {
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      ids[key] = await createStudent(admin, emails[key]);
    }

    offeringId = await offeringIdByCode(admin, 'CS-3040', RUNI_CURRENT_TERM_ID);

    /* All four in the same course, so visibility is never the reason something
       is hidden — the rating policy has to be. */
    const enrolled = await admin.from('enrollments').insert(
      Object.values(ids).map((id) => ({
        profile_id: id,
        course_offering_id: offeringId,
        university_id: RUNI_ID,
      })),
    );
    if (enrolled.error) {
      throw new Error(`enrolment seed failed: ${enrolled.error.message}`);
    }

    /* Preferences and availability, so the matching tests have real candidates. */
    const prefs = await admin.from('learning_preferences').insert(
      Object.values(ids).map((id) => ({
        profile_id: id,
        preferred_time_blocks: ['morning'] as never,
        study_environments: ['quiet'] as never,
        study_formats: ['in_person', 'remote'] as never,
        group_sizes: ['small'] as never,
        studies_on_saturday: false,
        spoken_languages: ['he', 'en'],
      })),
    );
    if (prefs.error) {
      throw new Error(`preference seed failed: ${prefs.error.message}`);
    }

    const slots = await admin.from('availability_slots').insert(
      Object.values(ids).map((id) => ({
        profile_id: id,
        day_of_week: 0,
        starts_at: '10:00',
        ends_at: '14:00',
      })),
    );
    if (slots.error) {
      throw new Error(`availability seed failed: ${slots.error.message}`);
    }

    await admin
      .from('profiles')
      .update({ is_discoverable: true, onboarding_completed_at: new Date().toISOString() })
      .in('id', Object.values(ids));

    rater = await signInAs(emails.rater);
    liked = await signInAs(emails.liked);
    disliked = await signInAs(emails.disliked);
    bystander = await signInAs(emails.bystander);

    /*
     * A conversation with all three, INCLUDING the bystander.
     *
     * Until Phase 7D a conversation was the evidence a rating rested on. It is
     * not any more, and the bystander is here to prove it: they have talked to
     * the rater and nothing else, so if a rating about them ever succeeds, the
     * rule has silently reverted.
     */
    for (const partner of [ids.liked, ids.disliked, ids.bystander]) {
      const created = await rater
        .from('conversations')
        .insert({
          participant_a: ids.rater,
          participant_b: partner,
          university_id: RUNI_ID,
          course_offering_id: offeringId,
        })
        .select('id')
        .single();

      if (created.error) {
        throw new Error(`conversation seed failed: ${created.error.message}`);
      }

      conversationIds[partner] = created.data.id;
    }

    /*
     * The evidence the rule now asks for: a finished meeting both of them
     * attended. Seeded for the two students who get rated, and deliberately not
     * for the bystander.
     */
    for (const partner of [ids.liked, ids.disliked]) {
      await seedCompletedMeeting(admin, {
        universityId: RUNI_ID,
        participants: [ids.rater, partner],
        conversationId: conversationIds[partner],
      });
    }
  }, 90_000);

  afterAll(async () => {
    await deleteStudents(admin, Object.values(ids));
  });

  // ===========================================================================
  // Writing a rating.
  // ===========================================================================

  describe('giving a rating', () => {
    it('accepts a positive rating for someone you have talked to', async () => {
      const { error } = await rater.from('study_ratings').insert({
        rater_id: ids.rater,
        ratee_id: ids.liked,
        sentiment: 'positive',
      });

      expect(error).toBeNull();
    });

    it('accepts a private negative rating, with a note', async () => {
      const { error } = await rater.from('study_ratings').insert({
        rater_id: ids.rater,
        ratee_id: ids.disliked,
        sentiment: 'negative',
        note: 'Did not turn up twice.',
      });

      expect(error).toBeNull();
    });

    it('refuses a rating about someone you have only TALKED to', async () => {
      /*
       * The Phase 7D rule, and the reason this test reads the way it does. The
       * rater and the bystander have a conversation — which was sufficient
       * evidence until this migration — and no meeting. A pass here would mean
       * the rule had quietly reverted to the weaker one.
       */
      const { error } = await rater.from('study_ratings').insert({
        rater_id: ids.rater,
        ratee_id: ids.bystander,
        sentiment: 'negative',
      });

      expect(error?.code).toBe(RLS_DENIED);
    });

    it('refuses a rating written in someone else’s name', async () => {
      const { error } = await bystander.from('study_ratings').insert({
        rater_id: ids.rater,
        ratee_id: ids.liked,
        sentiment: 'positive',
      });

      expect(error?.code).toBe(RLS_DENIED);
    });

    it('refuses rating yourself', async () => {
      const { error } = await rater.from('study_ratings').insert({
        rater_id: ids.rater,
        ratee_id: ids.rater,
        sentiment: 'positive',
      });

      expect(error).not.toBeNull();
    });

    it('refuses a second rating for the same pair', async () => {
      /* One row per direction: changing your mind is an update, not a second vote. */
      const { error } = await rater.from('study_ratings').insert({
        rater_id: ids.rater,
        ratee_id: ids.liked,
        sentiment: 'negative',
      });

      expect(error).not.toBeNull();
    });
  });

  // ===========================================================================
  // The Phase 7D rule, from every angle a determined student could try.
  // ===========================================================================

  describe('a rating cannot exist without a meeting that happened', () => {
    it('refuses a rating when the meeting has not finished yet', async () => {
      /* Booked, both going, still in the future. Attendance is not attendance
         until the session is over — otherwise you could rate on the way in. */
      const { data: future } = await admin
        .from('meetings')
        .insert({
          university_id: RUNI_ID,
          conversation_id: conversationIds[ids.bystander],
          created_by: ids.rater,
          title: 'Not yet happened',
          starts_at: new Date(Date.now() + 86_400_000).toISOString(),
          ends_at: new Date(Date.now() + 93_600_000).toISOString(),
        })
        .select('id')
        .single();

      await admin.from('meeting_attendees').insert([
        { meeting_id: future!.id, profile_id: ids.rater, rsvp: 'going' },
        { meeting_id: future!.id, profile_id: ids.bystander, rsvp: 'going' },
      ]);

      const { error } = await rater.from('study_ratings').insert({
        rater_id: ids.rater,
        ratee_id: ids.bystander,
        sentiment: 'positive',
      });

      expect(error?.code).toBe(RLS_DENIED);

      await admin.from('meetings').delete().eq('id', future!.id);
    });

    it('refuses a rating when the other person CANCELLED', async () => {
      /*
       * The forfeit rule. They were invited, the session happened, and they
       * pulled out — so there is no shared history to rate, in either direction.
       */
      const meetingId = await seedCompletedMeeting(admin, {
        universityId: RUNI_ID,
        participants: [ids.rater, ids.bystander],
        conversationId: conversationIds[ids.bystander],
      });

      await admin
        .from('meeting_attendees')
        .update({ rsvp: 'cancelled' })
        .eq('meeting_id', meetingId)
        .eq('profile_id', ids.bystander);

      const { error } = await rater.from('study_ratings').insert({
        rater_id: ids.rater,
        ratee_id: ids.bystander,
        sentiment: 'positive',
      });

      expect(error?.code).toBe(RLS_DENIED);

      await admin.from('meetings').delete().eq('id', meetingId);
    });

    it('refuses REPOINTING an existing rating at someone never met', async () => {
      /*
       * The hole Phase 6 left open, and the reason the rule is a trigger as well
       * as a policy. The UPDATE policy checks only `rater_id = auth.uid()`, so
       * this row is legitimately the rater's to edit — and without the trigger,
       * editing it is a rating of the bystander with no meeting behind it.
       */
      const { error } = await rater
        .from('study_ratings')
        .update({ ratee_id: ids.bystander })
        .eq('rater_id', ids.rater)
        .eq('ratee_id', ids.liked);

      expect(error).not.toBeNull();

      /* And it did not move. */
      const { data } = await rater
        .from('study_ratings')
        .select('id')
        .eq('ratee_id', ids.bystander);
      expect(data ?? []).toHaveLength(0);
    });

    it('refuses even the SERVICE ROLE, which bypasses every policy', async () => {
      /*
       * "The database must strictly enforce that it is impossible." RLS does not
       * apply to this role — every server action holding the service key runs as
       * it — so if the rule lived only in a policy, this insert would succeed and
       * the guarantee would be worth nothing.
       */
      const { error } = await admin.from('study_ratings').insert({
        rater_id: ids.bystander,
        ratee_id: ids.liked,
        sentiment: 'positive',
      });

      expect(error?.code).toBe(RLS_DENIED);
    });
  });

  // ===========================================================================
  // THE HEADLINE CLAIM.
  // ===========================================================================

  describe('a negative rating is visible to nobody but its author', () => {
    it('is readable by the author', async () => {
      const { data } = await rater
        .from('study_ratings')
        .select('sentiment, note')
        .eq('ratee_id', ids.disliked);

      expect(data).toHaveLength(1);
      expect(data![0].sentiment).toBe('negative');
      expect(data![0].note).toBe('Did not turn up twice.');
    });

    it('is INVISIBLE to the person it is about', async () => {
      /*
       * The test this whole suite exists for. Telling someone a partner rated them
       * negatively turns a quiet matching signal into a social wound, and the
       * specification asks for it to stay hidden — from them most of all.
       */
      const { data, error } = await disliked
        .from('study_ratings')
        .select('id, sentiment, note')
        .eq('ratee_id', ids.disliked);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('is invisible to a classmate', async () => {
      const { data } = await bystander
        .from('study_ratings')
        .select('id')
        .eq('ratee_id', ids.disliked);

      expect(data).toHaveLength(0);
    });

    it('is invisible even when asked for by id', async () => {
      const { data: mine } = await rater
        .from('study_ratings')
        .select('id')
        .eq('ratee_id', ids.disliked)
        .single();

      const asRatee = await disliked.from('study_ratings').select('id').eq('id', mine!.id);
      const asBystander = await bystander.from('study_ratings').select('id').eq('id', mine!.id);

      /* Knowing the id is not enough; the policy is on authorship. */
      expect(asRatee.data).toHaveLength(0);
      expect(asBystander.data).toHaveLength(0);
    });

    it('does not leak through an unfiltered read of the whole table', async () => {
      /*
       * The realistic mistake: a query that forgets `.eq('sentiment','positive')`.
       * The policy has to make that harmless, which is why the promise lives there
       * and not in application code.
       */
      const { data } = await disliked.from('study_ratings').select('id, sentiment');

      expect((data ?? []).every((row) => row.sentiment === 'positive')).toBe(true);
    });

    it('does not leak through a count either', async () => {
      const { count } = await disliked
        .from('study_ratings')
        .select('id', { count: 'exact', head: true })
        .eq('ratee_id', ids.disliked);

      /* Not "0 of 1" — genuinely nothing. A count would disclose existence. */
      expect(count).toBe(0);
    });
  });

  describe('a positive rating is public', () => {
    it('is visible to the person it is about', async () => {
      const { data } = await liked
        .from('study_ratings')
        .select('rater_id, sentiment')
        .eq('ratee_id', ids.liked);

      expect(data).toHaveLength(1);
      expect(data![0].rater_id).toBe(ids.rater);
    });

    it('is visible to a classmate, which is what puts it on a profile', async () => {
      const { data } = await bystander
        .from('study_ratings')
        .select('rater_id')
        .eq('ratee_id', ids.liked)
        .eq('sentiment', 'positive');

      expect(data).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Editing and withdrawing.
  // ===========================================================================

  describe('only the author can change a rating', () => {
    it('refuses the rated student flipping a rating about them', async () => {
      const { data } = await liked
        .from('study_ratings')
        .update({ sentiment: 'negative' })
        .eq('ratee_id', ids.liked)
        .select('id');

      /* Zero rows: the update policy is scoped to the author. */
      expect(data ?? []).toHaveLength(0);
    });

    it('refuses the rated student deleting a rating about them', async () => {
      const { data } = await disliked
        .from('study_ratings')
        .delete()
        .eq('ratee_id', ids.disliked)
        .select('id');

      expect(data ?? []).toHaveLength(0);

      /* Still there, from the author's side. */
      const { data: still } = await rater
        .from('study_ratings')
        .select('id')
        .eq('ratee_id', ids.disliked);
      expect(still).toHaveLength(1);
    });

    it('lets the author change their mind', async () => {
      const { error } = await rater
        .from('study_ratings')
        .update({ sentiment: 'negative' })
        .eq('rater_id', ids.rater)
        .eq('ratee_id', ids.liked);

      expect(error).toBeNull();

      /* And now it is hidden from the person it is about, because it is negative. */
      const { data } = await liked.from('study_ratings').select('id').eq('ratee_id', ids.liked);
      expect(data).toHaveLength(0);

      /* Put it back for the matching tests below. */
      await rater
        .from('study_ratings')
        .update({ sentiment: 'positive' })
        .eq('rater_id', ids.rater)
        .eq('ratee_id', ids.liked);
    });
  });

  // ===========================================================================
  // The effect on matching, which is the point of collecting them.
  // ===========================================================================

  describe('ratings change who is matched', () => {
    it('removes a negatively-rated pair from BOTH sides', async () => {
      const asRater = await rater.rpc('rpc_find_candidates', { p_limit: 100 });
      const asDisliked = await disliked.rpc('rpc_find_candidates', { p_limit: 100 });

      const raterSees = (asRater.data ?? []).map((row) => row.candidate_id);
      const dislikedSees = (asDisliked.data ?? []).map((row) => row.candidate_id);

      expect(raterSees).not.toContain(ids.disliked);
      /*
       * Symmetric on purpose. The rated student is never told, but they should not
       * keep being shown someone who has quietly opted out of them — a
       * one-directional exclusion would leave exactly that.
       */
      expect(dislikedSees).not.toContain(ids.rater);

      /* The bystander is unaffected: an exclusion is about a pair, not a person. */
      expect(raterSees).toContain(ids.bystander);
    });

    it('raises the score of a positively-rated student for everyone', async () => {
      /*
       * The bystander has rated nobody, so any difference between the two
       * candidates they see is the reputation bonus alone — the fixtures are
       * otherwise identical.
       */
      const { data } = await bystander.rpc('rpc_find_candidates', { p_limit: 100 });

      const scoreOf = (id: string) =>
        Number((data ?? []).find((row) => row.candidate_id === id)?.rule_score ?? 0);

      expect(scoreOf(ids.liked)).toBeGreaterThan(scoreOf(ids.rater));
    });

    it('saturates the bonus, so reputation cannot dominate the score', async () => {
      /*
       * Three positive ratings is the cap. Without one, a popular student would
       * out-rank someone who is actually free at the same time as you, which the
       * hours rule exists to prevent.
       */
      const { data: before } = await bystander.rpc('rpc_find_candidates', { p_limit: 100 });
      const scoreBefore = Number(
        (before ?? []).find((row) => row.candidate_id === ids.liked)?.rule_score ?? 0,
      );

      /* Four more raters, all positive, all with a conversation first. */
      const extras: string[] = [];
      for (let index = 0; index < 4; index += 1) {
        const email = `rate-extra-${index}-${stamp}@post.runi.ac.il`;
        const id = await createStudent(admin, email);
        extras.push(id);

        await admin.from('enrollments').insert({
          profile_id: id,
          course_offering_id: offeringId,
          university_id: RUNI_ID,
        });

        const client = await signInAs(email);
        await client.from('conversations').insert({
          participant_a: id,
          participant_b: ids.liked,
          university_id: RUNI_ID,
        });
        await client.from('study_ratings').insert({
          rater_id: id,
          ratee_id: ids.liked,
          sentiment: 'positive',
        });
      }

      const { data: after } = await bystander.rpc('rpc_find_candidates', { p_limit: 100 });
      const scoreAfter = Number(
        (after ?? []).find((row) => row.candidate_id === ids.liked)?.rule_score ?? 0,
      );

      /* Five raters, but the bonus stopped growing at three. */
      expect(scoreAfter - scoreBefore).toBeLessThanOrEqual(4);

      await deleteStudents(admin, extras);
    }, 120_000);
  });

  // ===========================================================================
  // Age on the profile.
  // ===========================================================================

  describe('app_profile_age_years', () => {
    beforeAll(async () => {
      await admin
        .from('profile_private')
        .upsert({ profile_id: ids.liked, date_of_birth: '2003-06-15' });
    });

    it('reports an age to a classmate who may see them', async () => {
      const { data } = await bystander.rpc('app_profile_age_years', {
        target_profile_id: ids.liked,
      });

      expect(typeof data).toBe('number');
      expect(data as number).toBeGreaterThan(15);
    });

    it('still does not expose the birth DATE', async () => {
      /*
       * The trade this function makes: a year is disclosed, the date is not. The
       * private table stays unreadable, which is why the date had to be split out
       * in the first place.
       */
      const { data } = await bystander
        .from('profile_private')
        .select('date_of_birth')
        .eq('profile_id', ids.liked);

      expect(data ?? []).toHaveLength(0);
    });

    it('returns null for a student who gave no date of birth', async () => {
      const { data } = await bystander.rpc('app_profile_age_years', {
        target_profile_id: ids.rater,
      });

      expect(data).toBeNull();
    });
  });
});
