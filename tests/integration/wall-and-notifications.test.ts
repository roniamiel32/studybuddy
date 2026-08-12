/**
 * File:        tests/integration/wall-and-notifications.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The security proof for Phase 8 — the wall's write rule, and the
 *              feed nobody may write to.
 *
 *              TWO PROMISES ARE UNDER TEST HERE.
 *
 *              THE WALL IS ASYMMETRIC: readable by anyone who may see the
 *              profile, writable only by a connection. A wall a stranger can post
 *              on is a comment section, and the assertion that catches that is
 *              the negative one.
 *
 *              THE FEED CANNOT BE FORGED. There is no INSERT policy on
 *              notifications at all, because a notification a student can write
 *              is a notification they can lie with — "you were promoted", from
 *              nobody.
 *
 *              Every test runs as a REAL SIGNED-IN STUDENT. The service role
 *              bypasses RLS, so a suite built on it would pass regardless.
 * Version:     0.20.0
 *
 * Modifications:
 *     0.20.0 - 2026-08-11 - Initial policy tests (Phase 8)
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
  console.warn('Skipping Phase 8 tests: run `npm run db:start` and populate .env.local.');
}

const DENIED = '42501';

describeDb('The wall, and the notification feed', () => {
  const admin = hasLocalDb() ? adminDb() : null!;
  const stamp = Math.random().toString(36).slice(2, 8);

  const emails = {
    /* The wall's owner. */
    owner: `wall-owner-${stamp}@post.runi.ac.il`,
    /* Studied with the owner, so a connection. */
    friend: `wall-friend-${stamp}@post.runi.ac.il`,
    /* Same course, never met them. Stays connected to NOBODY, which is what the
       negative tests rest on — do not borrow them for anything else. */
    stranger: `wall-stranger-${stamp}@post.runi.ac.il`,
    /* Connected to the friend and to nobody else: the one-end-only case that the
       share rule has to refuse. */
    acquaintance: `wall-acq-${stamp}@post.runi.ac.il`,
  };

  const ids: Record<keyof typeof emails, string> = {
    owner: '',
    friend: '',
    stranger: '',
    acquaintance: '',
  };
  const clients: Record<keyof typeof emails, SupabaseClient<Database>> = {} as never;

  let offeringId = '';

  beforeAll(async () => {
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      ids[key] = await createStudent(admin, emails[key]);
    }

    offeringId = await offeringIdByCode(admin, 'CS-3040', RUNI_CURRENT_TERM_ID);

    await admin.from('enrollments').insert(
      Object.values(ids).map((id) => ({
        profile_id: id,
        course_offering_id: offeringId,
        university_id: RUNI_ID,
      })),
    );

    await admin.from('learning_preferences').insert(
      Object.values(ids).map((id) => ({
        profile_id: id,
        preferred_time_blocks: ['morning'] as never,
        study_environments: ['quiet'] as never,
        study_formats: ['in_person'] as never,
        group_sizes: ['small'] as never,
        studies_on_saturday: false,
        spoken_languages: ['he', 'en'],
      })),
    );

    await admin
      .from('profiles')
      .update({ is_discoverable: true, onboarding_completed_at: new Date().toISOString() })
      .in('id', Object.values(ids));

    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      clients[key] = await signInAs(emails[key]);
    }

    /*
     * The connection, earned the only way Phase 7D allows: a finished meeting,
     * then a positive rating. The stranger deliberately gets neither, which is
     * what makes the negative tests below mean something.
     */
    const conversation = await clients.friend
      .from('conversations')
      .insert({
        participant_a: ids.friend,
        participant_b: ids.owner,
        university_id: RUNI_ID,
        course_offering_id: offeringId,
      })
      .select('id')
      .single();

    await seedCompletedMeeting(admin, {
      universityId: RUNI_ID,
      participants: [ids.friend, ids.owner],
      conversationId: conversation.data!.id,
    });

    const rated = await clients.friend.from('study_ratings').insert({
      rater_id: ids.friend,
      ratee_id: ids.owner,
      sentiment: 'positive',
    });

    if (rated.error) {
      throw new Error(`connection seed failed: ${rated.error.message}`);
    }
  }, 90_000);

  afterAll(async () => {
    await deleteStudents(admin, Object.values(ids));
  });

  // ===========================================================================
  // The wall.
  // ===========================================================================

  describe('who may write on a wall', () => {
    it('lets a connection post', async () => {
      const { error } = await clients.friend.from('wall_posts').insert({
        profile_owner_id: ids.owner,
        author_id: ids.friend,
        body: 'Happy birthday! 🎉',
      });

      expect(error).toBeNull();
    });

    it('lets the owner post on their own wall', async () => {
      const { error } = await clients.owner.from('wall_posts').insert({
        profile_owner_id: ids.owner,
        author_id: ids.owner,
        body: 'Looking for a partner for the final.',
      });

      expect(error).toBeNull();
    });

    it('refuses a classmate who has never studied with them', async () => {
      /*
       * THE TEST THIS SUITE EXISTS FOR. The stranger shares a course, can see the
       * profile, and can read every word on the wall — and still cannot write on
       * it, because a connection is earned by meeting rather than by enrolling.
       */
      const { error } = await clients.stranger.from('wall_posts').insert({
        profile_owner_id: ids.owner,
        author_id: ids.stranger,
        body: 'Hello stranger.',
      });

      expect(error?.code).toBe(DENIED);
    });

    it('refuses posting in someone else’s name', async () => {
      const { error } = await clients.stranger.from('wall_posts').insert({
        profile_owner_id: ids.owner,
        author_id: ids.friend,
        body: 'Not actually from them.',
      });

      expect(error?.code).toBe(DENIED);
    });
  });

  describe('who may read a wall', () => {
    it('is readable by a classmate who cannot write on it', async () => {
      const { data } = await clients.stranger
        .from('wall_posts')
        .select('body')
        .eq('profile_owner_id', ids.owner);

      /* The asymmetry, from the reading side: two posts visible, none writable. */
      expect((data ?? []).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('who may remove a post', () => {
    it('lets the wall’s owner remove something written by someone else', async () => {
      /*
       * Not just their own posts — anything on their own wall. A birthday wish can
       * land badly, and "ask the author to take it down" is not a moderation
       * policy.
       */
      const { data: theirs } = await clients.friend
        .from('wall_posts')
        .select('id')
        .eq('author_id', ids.friend)
        .single();

      const { data } = await clients.owner
        .from('wall_posts')
        .delete()
        .eq('id', theirs!.id)
        .select('id');

      expect(data).toHaveLength(1);
    });

    it('refuses a classmate removing someone else’s post', async () => {
      const { data: any_post } = await clients.owner
        .from('wall_posts')
        .select('id')
        .eq('profile_owner_id', ids.owner)
        .limit(1)
        .single();

      const { data } = await clients.stranger
        .from('wall_posts')
        .delete()
        .eq('id', any_post!.id)
        .select('id');

      expect(data ?? []).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Sharing, and the rule that runs the other way.
  // ===========================================================================

  describe('a shared post needs BOTH ends', () => {
    it('is invisible to someone connected to only the sharer', async () => {
      /*
       * THE TEST THIS PART EXISTS FOR.
       *
       * The friend shares the owner's post onto their own wall. The acquaintance is
       * connected to the friend — and to nobody else — so they must not see it.
       * Passing a post along cannot widen the audience for words written to a
       * smaller one, and the failure mode this catches is the natural one: a
       * share treated like any other post on the sharer's wall.
       */
      const { data: original } = await admin
        .from('wall_posts')
        .insert({
          profile_owner_id: ids.owner,
          author_id: ids.owner,
          body: 'Something the owner wrote for their own connections.',
        })
        .select('id')
        .single();

      const shared = await clients.friend.from('wall_posts').insert({
        profile_owner_id: ids.friend,
        author_id: ids.friend,
        body: null,
        original_post_id: original!.id,
      });

      expect(shared.error).toBeNull();

      /* The stranger becomes a connection of the SHARER only. */
      const conversation = await clients.acquaintance
        .from('conversations')
        .insert({
          participant_a: ids.acquaintance,
          participant_b: ids.friend,
          university_id: RUNI_ID,
          course_offering_id: offeringId,
        })
        .select('id')
        .single();

      await seedCompletedMeeting(admin, {
        universityId: RUNI_ID,
        participants: [ids.acquaintance, ids.friend],
        conversationId: conversation.data!.id,
      });

      await clients.acquaintance.from('study_ratings').insert({
        rater_id: ids.acquaintance,
        ratee_id: ids.friend,
        sentiment: 'positive',
      });

      /* Connected to the sharer, not to the author. Nothing. */
      const { data: seen } = await clients.acquaintance
        .from('wall_posts')
        .select('id')
        .eq('profile_owner_id', ids.friend)
        .not('original_post_id', 'is', null);

      expect(seen ?? []).toHaveLength(0);

      /* And the sharer still sees it on their own wall. */
      const { data: mine } = await clients.friend
        .from('wall_posts')
        .select('id')
        .eq('profile_owner_id', ids.friend)
        .not('original_post_id', 'is', null);

      expect(mine).toHaveLength(1);
    });

    it('refuses a like on a shared post the caller cannot see', async () => {
      /*
       * Likes hang off posts, so they are a side channel unless they ask the same
       * question. Without app_can_see_wall_post this insert would confirm the
       * share exists.
       */
      const { data: share } = await admin
        .from('wall_posts')
        .select('id')
        .eq('profile_owner_id', ids.friend)
        .not('original_post_id', 'is', null)
        .single();

      const { error } = await clients.acquaintance.from('post_likes').insert({
        post_id: share!.id,
        profile_id: ids.acquaintance,
      });

      expect(error?.code).toBe(DENIED);
    });

    it('refuses sharing a share', async () => {
      const { data: share } = await admin
        .from('wall_posts')
        .select('id')
        .eq('profile_owner_id', ids.friend)
        .not('original_post_id', 'is', null)
        .single();

      const { error } = await clients.owner.from('wall_posts').insert({
        profile_owner_id: ids.owner,
        author_id: ids.owner,
        body: null,
        original_post_id: share!.id,
      });

      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/original post/i);
    });
  });

  describe('likes and comments', () => {
    it('counts one like per person, however many times they press it', async () => {
      const { data: post } = await admin
        .from('wall_posts')
        .insert({
          profile_owner_id: ids.owner,
          author_id: ids.owner,
          body: 'A post to like.',
        })
        .select('id')
        .single();

      const first = await clients.friend
        .from('post_likes')
        .insert({ post_id: post!.id, profile_id: ids.friend });
      expect(first.error).toBeNull();

      /* The primary key, not the button, is what makes this impossible. */
      const second = await clients.friend
        .from('post_likes')
        .insert({ post_id: post!.id, profile_id: ids.friend });
      expect(second.error).not.toBeNull();
    });

    it('lets the wall owner remove a comment somebody else left', async () => {
      const { data: post } = await admin
        .from('wall_posts')
        .select('id')
        .eq('profile_owner_id', ids.owner)
        .limit(1)
        .single();

      const { data: comment } = await clients.friend
        .from('post_comments')
        .insert({ post_id: post!.id, author_id: ids.friend, body: 'Nice one.' })
        .select('id')
        .single();

      const { data } = await clients.owner
        .from('post_comments')
        .delete()
        .eq('id', comment!.id)
        .select('id');

      expect(data).toHaveLength(1);
    });
  });

  // ===========================================================================
  // The feed.
  // ===========================================================================

  describe('notifications cannot be forged', () => {
    it('refuses a student writing one for themselves', async () => {
      /*
       * There is no INSERT policy on this table at all. "You were promoted to
       * admin", from nobody, is the reason.
       */
      const { error } = await clients.stranger.from('notifications').insert({
        recipient_id: ids.stranger,
        type: 'group_promotion',
        group_id: null,
      } as never);

      expect(error).not.toBeNull();
    });

    it('refuses a student writing one for someone else', async () => {
      const { error } = await clients.stranger.from('notifications').insert({
        recipient_id: ids.owner,
        type: 'new_match',
        actor_id: ids.stranger,
      } as never);

      expect(error).not.toBeNull();
    });

    it('is invisible to anyone but its recipient', async () => {
      await admin.from('notifications').insert({
        recipient_id: ids.owner,
        type: 'new_match',
        actor_id: ids.friend,
      });

      const mine = await clients.owner.from('notifications').select('id');
      const theirs = await clients.stranger.from('notifications').select('id');

      expect((mine.data ?? []).length).toBeGreaterThan(0);
      expect(theirs.data ?? []).toHaveLength(0);
    });

    it('lets the recipient mark one read, and nothing else', async () => {
      const { data: mine } = await clients.owner
        .from('notifications')
        .select('id')
        .limit(1)
        .single();

      const read = await clients.owner
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', mine!.id)
        .select('id');

      expect(read.data).toHaveLength(1);

      /* The freeze trigger: everything except read_at is fixed. */
      const rewritten = await clients.owner
        .from('notifications')
        .update({ type: 'group_promotion' })
        .eq('id', mine!.id);

      expect(rewritten.error?.code).toBe(DENIED);
    });
  });

  // ===========================================================================
  // The events that write themselves.
  // ===========================================================================

  describe('events notify without the application asking', () => {
    it('tells every admin when someone asks to join', async () => {
      const group = await clients.owner
        .from('study_groups')
        .insert({
          course_offering_id: offeringId,
          university_id: RUNI_ID,
          admin_id: ids.owner,
          name: `Notify crew ${stamp}`,
          max_participants: 5,
        })
        .select('id')
        .single();

      expect(group.error).toBeNull();

      await clients.stranger.from('group_requests').insert({
        group_id: group.data!.id,
        requester_id: ids.stranger,
        status: 'pending',
      });

      const { data } = await clients.owner
        .from('notifications')
        .select('type, actor_id, group_id')
        .eq('type', 'group_request')
        .eq('group_id', group.data!.id);

      expect(data).toHaveLength(1);
      expect(data![0].actor_id).toBe(ids.stranger);
    });

    it('tells a member when they are promoted', async () => {
      const group = await clients.owner
        .from('study_groups')
        .insert({
          course_offering_id: offeringId,
          university_id: RUNI_ID,
          admin_id: ids.owner,
          name: `Promote crew ${stamp}`,
          max_participants: 5,
        })
        .select('id')
        .single();

      await admin
        .from('study_group_members')
        .insert({ group_id: group.data!.id, profile_id: ids.friend });

      await clients.owner
        .from('study_group_members')
        .update({ role: 'admin' })
        .eq('group_id', group.data!.id)
        .eq('profile_id', ids.friend);

      const { data } = await clients.friend
        .from('notifications')
        .select('type, group_id')
        .eq('type', 'group_promotion')
        .eq('group_id', group.data!.id);

      expect(data).toHaveLength(1);
    });
  });

  // ===========================================================================
  // The ones with no event behind them.
  // ===========================================================================

  describe('derived notifications', () => {
    it('is idempotent, so the feed can sync on every open', async () => {
      await admin
        .from('profile_private')
        .upsert({ profile_id: ids.friend, date_of_birth: '2003-01-01' });

      /* Today, whatever today is — the birthday only fires on the day. */
      const today = new Date();
      await admin.from('profile_private').upsert({
        profile_id: ids.friend,
        date_of_birth: `2003-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
          today.getDate(),
        ).padStart(2, '0')}`,
      });

      await clients.owner.rpc('rpc_sync_notifications');
      await clients.owner.rpc('rpc_sync_notifications');
      await clients.owner.rpc('rpc_sync_notifications');

      const { data } = await clients.owner
        .from('notifications')
        .select('id')
        .eq('type', 'birthday')
        .eq('actor_id', ids.friend);

      /* Three syncs, one birthday. The partial unique index is what does it. */
      expect(data).toHaveLength(1);
    });

    it('does not announce a birthday to someone who is not a connection', async () => {
      await clients.stranger.rpc('rpc_sync_notifications');

      const { data } = await clients.stranger
        .from('notifications')
        .select('id')
        .eq('type', 'birthday');

      expect(data ?? []).toHaveLength(0);
    });

    it('never returns the birth year, only the day', async () => {
      /*
       * §15.4 promised the date never leaves the database. This returns month and
       * day and no year — less than app_profile_age_years already discloses.
       */
      const { data } = await clients.owner.rpc('app_connection_birthday', {
        target_profile_id: ids.friend,
      });

      const row = (data ?? [])[0] as { birth_month: number; birth_day: number } | undefined;

      expect(row).toBeDefined();
      expect(Object.keys(row ?? {}).sort()).toEqual(['birth_day', 'birth_month']);
    });

    it('refuses a birthday to a stranger', async () => {
      const { data } = await clients.stranger.rpc('app_connection_birthday', {
        target_profile_id: ids.friend,
      });

      expect(data ?? []).toHaveLength(0);
    });
  });
});
