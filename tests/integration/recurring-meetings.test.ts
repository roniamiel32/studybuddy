/**
 * File:        tests/integration/recurring-meetings.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Weekly series — the three rules that cannot be checked anywhere
 *              but against a real database.
 *
 *              THE SKIP IS THE INTERESTING ONE. Every other write in this schema
 *              is all-or-nothing, and a series deliberately is not: one busy week
 *              three weeks out must not stop somebody studying every Tuesday.
 *              That behaviour lives in an exception block inside a plpgsql
 *              subtransaction, which is exactly the kind of thing that looks
 *              right and silently swallows the wrong errors — so it is asserted
 *              against the real clash trigger, with a real conflicting booking.
 *
 *              THE FIRST WEEK IS THE OPPOSITE RULE, and asserting both together
 *              is the point: the first occurrence IS the booking the student is
 *              making, so a clash there has to fail loudly and leave no series
 *              behind. One test would pass against an implementation that got
 *              the other backwards.
 *
 *              CANCELLING IS ASSERTED FROM NOW ON, not wholesale. A series
 *              cancelled in March must leave February alone, because the rating
 *              rule in 7D reads those rows to decide who may rate whom.
 * Version:     0.53.0
 *
 * Modifications:
 *     0.53.0 - 2026-09-01 - Initial tests (recurring meetings)
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
  console.warn('Skipping recurring tests: run `npm run db:start` and populate .env.local.');
}

/** A week, in milliseconds. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

describeDb('Recurring meetings', () => {
  const admin = hasLocalDb() ? adminDb() : null!;
  const stamp = Math.random().toString(36).slice(2, 8);

  const emails = {
    ada: `rm-ada-${stamp}@post.runi.ac.il`,
    ben: `rm-ben-${stamp}@post.runi.ac.il`,
  };

  const ids: Record<keyof typeof emails, string> = { ada: '', ben: '' };
  const clients: Record<keyof typeof emails, SupabaseClient<Database>> = {} as never;

  let conversationId = '';

  /**
   * A two-hour window `dayOffset` days out, starting at `hour` UTC.
   *
   * Hours are kept apart per test rather than reused: every test in this file
   * books into the same conversation, and the clash trigger does not care which
   * test wrote the row it is refusing.
   *
   * @param dayOffset - Days from now.
   * @param hour      - UTC hour it starts.
   * @returns The window.
   */
  function window(dayOffset: number, hour: number) {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + dayOffset);
    start.setUTCHours(hour, 0, 0, 0);

    return {
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 7_200_000).toISOString(),
    };
  }

  /** Every occurrence of a series, soonest first. */
  async function occurrencesOf(seriesId: string) {
    const { data } = await admin
      .from('meetings')
      .select('id, starts_at, ends_at, status, series_id')
      .eq('series_id', seriesId)
      .order('starts_at');

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

    const conversation = await clients.ada
      .from('conversations')
      .insert({
        participant_a: ids.ada,
        participant_b: ids.ben,
        university_id: RUNI_ID,
        course_offering_id: offeringId,
      })
      .select('id')
      .single();
    if (conversation.error) {
      throw new Error(`conversation seed failed: ${conversation.error.message}`);
    }
    conversationId = conversation.data.id;
  }, 90_000);

  afterAll(async () => {
    if (hasLocalDb()) {
      await deleteStudents(admin, Object.values(ids));
    }
  });

  it('books the whole horizon, a week apart, with everyone on every occurrence', async () => {
    const first = window(3, 8);

    const { data, error } = await clients.ada.rpc('rpc_create_meeting_series', {
      p_conversation_id: conversationId,
      p_title: 'Every Tuesday',
      p_location: 'Library, floor 2',
      p_starts_at: [first.startsAt],
      p_ends_at: [first.endsAt],
    });

    expect(error).toBeNull();
    expect(data).toHaveLength(1);

    const occurrences = await occurrencesOf((data as string[])[0]);

    /* Eight weeks of horizon, so at least eight sittings are already booked —
       the exact count depends on where the first one falls inside the window. */
    expect(occurrences.length).toBeGreaterThanOrEqual(8);

    /* Exactly a week apart, every time. A series that drifts by an hour at a
       daylight-saving boundary is the classic failure here, which is why the
       occurrences are instants derived by adding a week rather than a rebuilt
       wall clock. */
    for (let index = 1; index < occurrences.length; index += 1) {
      const gap =
        new Date(occurrences[index].starts_at).getTime() -
        new Date(occurrences[index - 1].starts_at).getTime();

      expect(gap).toBe(WEEK_MS);
    }

    const { data: attendees } = await admin
      .from('meeting_attendees')
      .select('meeting_id, profile_id')
      .in(
        'meeting_id',
        occurrences.map((occurrence) => occurrence.id),
      );

    expect(attendees).toHaveLength(occurrences.length * 2);
  });

  it('lets the people in it read the rule, not just the sittings', async () => {
    /* The 42501 this schema has been bitten by before: a table with policies and
       no grant reads as empty rather than as forbidden. */
    const { data, error } = await clients.ben
      .from('meeting_series')
      .select('id, title, frequency, status')
      .eq('title', 'Every Tuesday');

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0].frequency).toBe('weekly');
    expect(data?.[0].status).toBe('active');
  });

  it('skips a week that is already taken, and keeps going after it', async () => {
    const busy = window(17, 10);

    /* A real conflicting booking, manufactured rather than raced: Ben takes the
       third Tuesday before the series is created. */
    const blocked = await clients.ben.rpc('rpc_create_meeting', {
      p_conversation_id: conversationId,
      p_title: 'Dentist, unfortunately',
      p_starts_at: busy.startsAt,
      p_ends_at: busy.endsAt,
    });
    expect(blocked.error).toBeNull();

    const first = window(3, 10);

    const { data, error } = await clients.ada.rpc('rpc_create_meeting_series', {
      p_conversation_id: conversationId,
      p_title: 'Every Tuesday, mostly',
      p_starts_at: [first.startsAt],
      p_ends_at: [first.endsAt],
    });

    expect(error).toBeNull();

    const starts = (await occurrencesOf((data as string[])[0])).map(
      (occurrence) => occurrence.starts_at,
    );

    /*
     * THE ASSERTION THIS FILE EXISTS FOR. The busy week is absent, and the weeks
     * on either side of it are present — a series that gave up at the clash
     * would satisfy the first half of that and fail the second.
     */
    const taken = new Date(busy.startsAt).getTime();
    const times = starts.map((value) => new Date(value).getTime());

    expect(times).not.toContain(taken);
    expect(times).toContain(taken - WEEK_MS);
    expect(times).toContain(taken + WEEK_MS);
  });

  it('refuses the whole booking when the first sitting clashes', async () => {
    const wanted = window(4, 12);

    const blocked = await clients.ben.rpc('rpc_create_meeting', {
      p_conversation_id: conversationId,
      p_title: 'Already spoken for',
      p_starts_at: wanted.startsAt,
      p_ends_at: wanted.endsAt,
    });
    expect(blocked.error).toBeNull();

    const { error } = await clients.ada.rpc('rpc_create_meeting_series', {
      p_conversation_id: conversationId,
      p_title: 'Never happens',
      p_starts_at: [wanted.startsAt],
      p_ends_at: [wanted.endsAt],
    });

    /* Loud, because the first sitting is the booking the student is making. */
    expect(error?.code).toBe('23505');

    /* And nothing left behind: the series row is inserted before the occurrence
       is attempted, so this is a real test of the rollback. */
    const { data: orphans } = await admin
      .from('meeting_series')
      .select('id')
      .eq('title', 'Never happens');

    expect(orphans).toEqual([]);
  });

  it('cancels from now on, and leaves what already happened alone', async () => {
    const first = window(2, 14);

    const { data } = await clients.ada.rpc('rpc_create_meeting_series', {
      p_conversation_id: conversationId,
      p_title: 'Stops on Thursday',
      p_starts_at: [first.startsAt],
      p_ends_at: [first.endsAt],
    });

    const seriesId = (data as string[])[0];

    /*
     * A sitting that already happened. Written in two steps because a meeting
     * cannot be INSERTED in the past — the consistency trigger refuses it, and
     * only on insert — which is the same reason no fixture in this suite can
     * conjure history in one statement. The series was booked moments ago and
     * has no past of its own yet.
     */
    const history = await admin
      .from('meetings')
      .insert({
        university_id: RUNI_ID,
        conversation_id: conversationId,
        created_by: ids.ada,
        title: 'Stops on Thursday',
        starts_at: window(1, 6).startsAt,
        ends_at: window(1, 6).endsAt,
        series_id: seriesId,
      })
      .select('id')
      .single();
    expect(history.error).toBeNull();

    const past = window(-14, 14);
    const backdated = await admin
      .from('meetings')
      .update({ starts_at: past.startsAt, ends_at: past.endsAt })
      .eq('id', history.data!.id);
    expect(backdated.error).toBeNull();

    const stopped = await clients.ada.rpc('rpc_cancel_meeting_series', {
      p_meeting_id: (await occurrencesOf(seriesId)).filter(
        (occurrence) => new Date(occurrence.starts_at) > new Date(),
      )[0].id,
    });

    expect(stopped.error).toBeNull();
    expect(stopped.data).toBeGreaterThanOrEqual(8);

    const after = await occurrencesOf(seriesId);
    const future = after.filter((occurrence) => new Date(occurrence.starts_at) > new Date());

    expect(future.every((occurrence) => occurrence.status === 'cancelled')).toBe(true);

    /* February survives March. The rating rule in 7D reads exactly this row. */
    const kept = after.find((occurrence) => occurrence.id === history.data!.id);
    expect(kept?.status).toBe('scheduled');

    const { data: series } = await admin
      .from('meeting_series')
      .select('status, cancelled_by')
      .eq('id', seriesId)
      .single();

    expect(series?.status).toBe('cancelled');
    expect(series?.cancelled_by).toBe(ids.ada);
  });

  it('lets only the organiser stop the series', async () => {
    const first = window(5, 16);

    const { data } = await clients.ada.rpc('rpc_create_meeting_series', {
      p_conversation_id: conversationId,
      p_title: 'Ada organises this',
      p_starts_at: [first.startsAt],
      p_ends_at: [first.endsAt],
    });

    const occurrences = await occurrencesOf((data as string[])[0]);

    /*
     * Ben cannot end it for both of them. One person who can no longer make
     * Tuesdays steps out with their own rsvp, which is a different act — the
     * same split rpc_cancel_meeting already draws for a one-off.
     */
    const { error } = await clients.ben.rpc('rpc_cancel_meeting_series', {
      p_meeting_id: occurrences[0].id,
    });

    expect(error?.code).toBe('42501');
    expect((await occurrencesOf((data as string[])[0])).every(
      (occurrence) => occurrence.status === 'scheduled',
    )).toBe(true);
  });

  it('tops the horizon up without booking anything twice', async () => {
    const first = window(6, 18);

    const { data } = await clients.ada.rpc('rpc_create_meeting_series', {
      p_conversation_id: conversationId,
      p_title: 'Rolls forward',
      p_starts_at: [first.startsAt],
      p_ends_at: [first.endsAt],
    });

    const seriesId = (data as string[])[0];
    const before = await occurrencesOf(seriesId);

    /* The nightly job, run by hand. Idempotence is the whole requirement: it
       runs every night against a series that is already full. */
    const swept = await admin.rpc('sync_meeting_series');
    expect(swept.error).toBeNull();

    const after = await occurrencesOf(seriesId);

    expect(after.map((occurrence) => occurrence.starts_at)).toEqual(
      before.map((occurrence) => occurrence.starts_at),
    );
  });
});
