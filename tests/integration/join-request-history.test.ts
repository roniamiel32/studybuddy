/**
 * File:        tests/integration/join-request-history.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Phase 9I — the four rules join requests are supposed to keep.
 *
 *              WRITTEN BECAUSE THE SCHEMA WAS ACCUSED OF A BUG IT DID NOT HAVE.
 *              The admin's feed filled with identical "Pending" cards, and the
 *              unique index over (group_id, requester_id) looked like the cause
 *              — so the proposed fix was to drop it. It is a PARTIAL index
 *              covering only pending and approved rows, which is precisely what
 *              all four rules need; dropping it would have removed the only
 *              thing stopping somebody queueing ten requests at once. The real
 *              cause was in the application, and it is asserted at the bottom.
 *
 *              THE TEST THAT WOULD HAVE CAUGHT IT is the notification count. One
 *              request must produce one notification, and asking again after a
 *              refusal must produce a second — no more, no fewer. The old
 *              delete-and-reinsert produced one per click while leaving a single
 *              request row behind, which no assertion about group_requests alone
 *              would have noticed.
 * Version:     0.31.0
 *
 * Modifications:
 *     0.31.0 - 2026-08-14 - Initial tests (Phase 9I)
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
  console.warn('Skipping join-request tests: run `npm run db:start` and populate .env.local.');
}

/** Postgres unique_violation — what the live-request index refuses with. */
const DUPLICATE = '23505';

describeDb('Join requests: history, and one live request at a time', () => {
  const admin = hasLocalDb() ? adminDb() : null!;
  const stamp = Math.random().toString(36).slice(2, 8);

  const emails = {
    owner: `jr-owner-${stamp}@post.runi.ac.il`,
    asker: `jr-asker-${stamp}@post.runi.ac.il`,
  };

  const ids: Record<keyof typeof emails, string> = { owner: '', asker: '' };
  const clients: Record<keyof typeof emails, SupabaseClient<Database>> = {} as never;

  let groupId = '';

  /** Every request this pair has ever made, oldest first. */
  async function history() {
    const { data } = await admin
      .from('group_requests')
      .select('id, status, created_at, decided_at')
      .eq('group_id', groupId)
      .eq('requester_id', ids.asker)
      .order('created_at');

    return data ?? [];
  }

  /** Undismissed join-request notifications the owner can see. */
  async function feed() {
    const { data } = await admin
      .from('notifications')
      .select('id')
      .eq('type', 'group_request')
      .eq('group_id', groupId)
      .eq('actor_id', ids.asker)
      .is('dismissed_at', null);

    return data ?? [];
  }

  beforeAll(async () => {
    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      ids[key] = await createStudent(admin, emails[key]);
    }

    const offeringId = await offeringIdByCode(admin, 'CS-3040', RUNI_CURRENT_TERM_ID);

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

    await admin
      .from('profiles')
      .update({ is_discoverable: true, onboarding_completed_at: new Date().toISOString() })
      .in('id', Object.values(ids));

    for (const key of Object.keys(emails) as Array<keyof typeof emails>) {
      clients[key] = await signInAs(emails[key]);
    }

    const group = await clients.owner
      .from('study_groups')
      .insert({
        course_offering_id: offeringId,
        university_id: RUNI_ID,
        admin_id: ids.owner,
        name: `Thursday revision ${stamp}`,
        max_participants: 5,
      })
      .select('id')
      .single();
    if (group.error) {
      throw new Error(`group seed failed: ${group.error.message}`);
    }
    groupId = group.data.id;
  }, 90_000);

  afterAll(async () => {
    if (!hasLocalDb()) {
      return;
    }

    /*
     * THE GROUP GOES FIRST, and not for tidiness. Deleting the owner while they
     * still administer a group leaves the admin API unable to remove the auth
     * user, and deleteStudents does not check that error — so the account stays
     * behind, its group keeps its name, and the NEXT e2e run matches two study
     * groups called "Thursday revision" and fails on an ambiguous locator. That
     * is the fixture leak this project has been bitten by before; dropping the
     * group cascades the requests and the membership out of the way first.
     */
    await admin.from('study_groups').delete().eq('id', groupId);
    await deleteStudents(admin, Object.values(ids));
  });

  it('rule 3: refuses a second request while one is still pending', async () => {
    const first = await clients.asker
      .from('group_requests')
      .insert({ group_id: groupId, requester_id: ids.asker, status: 'pending' });

    expect(first.error).toBeNull();

    const second = await clients.asker
      .from('group_requests')
      .insert({ group_id: groupId, requester_id: ids.asker, status: 'pending' });

    /*
     * The partial index doing its job. requestToJoin turns this into "you have
     * already asked" — it must never turn it into a delete and a re-insert.
     */
    expect(second.error?.code).toBe(DUPLICATE);
    expect(await history()).toHaveLength(1);
  });

  it('rule 4: one request produces exactly one notification', async () => {
    /* Even though the insert above was attempted twice. */
    expect(await feed()).toHaveLength(1);
  });

  it('rule 1: a decided request cannot be pushed back to pending', async () => {
    const rejected = await clients.owner.rpc('rpc_reject_group_request', {
      p_request_id: (await history())[0].id,
      p_note: 'Full for now, sorry.',
    });

    expect(rejected.error).toBeNull();

    const reopen = await clients.owner
      .from('group_requests')
      .update({ status: 'pending' })
      .eq('id', (await history())[0].id);

    /* freeze_group_request, and the UPDATE policy's own WITH CHECK. */
    expect(reopen.error).not.toBeNull();
    expect((await history())[0].status).toBe('rejected');
  });

  it('rule 1: nobody can delete a request to make room for a new one', async () => {
    /*
     * `authenticated` has no DELETE grant, which is what makes the history
     * immutable rather than merely discouraged. The bug this suite documents got
     * around it with a service-role client — the grant was never the weak point,
     * the decision to bypass it was.
     */
    const removed = await clients.asker
      .from('group_requests')
      .delete()
      .eq('id', (await history())[0].id);

    expect(removed.error).not.toBeNull();
    expect(await history()).toHaveLength(1);
  });

  it('rule 2: asking again after a refusal is a brand new request', async () => {
    const before = await history();

    const again = await clients.asker
      .from('group_requests')
      .insert({ group_id: groupId, requester_id: ids.asker, status: 'pending' });

    /*
     * NO 23505 HERE, and this is the fact the whole diagnosis turned on. A
     * rejected row sits outside the partial index, so a fresh request is a plain
     * INSERT — nothing has to be cleared out of the way, and the constraint the
     * bug report proposed dropping never stood in the way at all.
     */
    expect(again.error).toBeNull();

    const after = await history();

    expect(after).toHaveLength(2);
    /* Its own id and its own timestamp; the old row untouched. */
    expect(after[1].id).not.toBe(before[0].id);
    expect(after[1].status).toBe('pending');
    expect(after[0]).toEqual(before[0]);
  });

  it('rule 4: the new request adds exactly one more notification', async () => {
    /*
     * Two requests, two notifications. The delete-and-reinsert produced one per
     * click while history() stayed at a single row — so this count, not the row
     * count, is what pins the flooded feed down.
     */
    expect(await feed()).toHaveLength(2);
  });

  it('rule 3 again: the new pending request blocks a third', async () => {
    const third = await clients.asker
      .from('group_requests')
      .insert({ group_id: groupId, requester_id: ids.asker, status: 'pending' });

    expect(third.error?.code).toBe(DUPLICATE);
    expect(await history()).toHaveLength(2);
    expect(await feed()).toHaveLength(2);
  });

  it('rule 3: approval also holds the slot, so they cannot ask again', async () => {
    const approved = await clients.owner.rpc('rpc_approve_group_request', {
      p_request_id: (await history())[1].id,
    });

    expect(approved.error).toBeNull();

    const asking = await clients.asker
      .from('group_requests')
      .insert({ group_id: groupId, requester_id: ids.asker, status: 'pending' });

    /* 'approved' is inside the partial index too — a member cannot queue a
       request to join a group they are already in. */
    expect(asking.error).not.toBeNull();
    expect(await history()).toHaveLength(2);
  });
});
