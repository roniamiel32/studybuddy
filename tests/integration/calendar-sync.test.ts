/**
 * File:        tests/integration/calendar-sync.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The privileges and policies the calendar integration depends on.
 *
 *              THIS FILE EXISTS BECAUSE OF A REAL BUG. The calendar tables were
 *              created with RLS enabled and no grants, on the reasoning that
 *              service_role bypasses RLS. It does — and it still needs a
 *              table-level GRANT like any other role. Every write failed with
 *              42501, the errors were swallowed, and the student was told the
 *              Google sync had failed when nothing had ever been written to the
 *              database. Typecheck, lint and the unit tests were all green.
 *
 *              Nothing here talks to Google. These are assertions about who may
 *              touch which table, which is exactly the layer that broke.
 * Version:     0.47.0
 *
 * Modifications:
 *     0.47.0 - 2026-08-18 - Initial tests (calendar sync grants fix)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { adminDb, createStudent, deleteStudents, hasLocalDb, signInAs } from './helpers/db';

const describeDb = hasLocalDb() ? describe : describe.skip;

if (!hasLocalDb()) {
  console.warn('Skipping calendar tests: run `npm run db:start` and populate .env.local.');
}

describeDb('Google Calendar integration', () => {
  const admin = hasLocalDb() ? adminDb() : null!;
  const stamp = Math.random().toString(36).slice(2, 8);
  const email = `calendar-${stamp}@post.runi.ac.il`;
  const otherEmail = `calendar-other-${stamp}@post.runi.ac.il`;

  let profileId = '';
  let otherId = '';

  beforeAll(async () => {
    profileId = await createStudent(admin, email);
    otherId = await createStudent(admin, otherEmail);
  });

  afterAll(async () => {
    if (hasLocalDb()) {
      await admin.from('calendar_connections').delete().eq('profile_id', profileId);
      await deleteStudents(admin, [profileId, otherId]);
    }
  });

  describe('calendar_connections', () => {
    it('lets the service role store a connection', async () => {
      // The exact write saveConnection makes. It failed with 42501 for want of a
      // GRANT, and the swallowed error is what made the symptom unreadable.
      const { error } = await admin.from('calendar_connections').upsert(
        {
          profile_id: profileId,
          provider: 'google',
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          expires_at: new Date(Date.now() + 3_600_000).toISOString(),
          scope: 'https://www.googleapis.com/auth/calendar.readonly',
          calendar_timezone: 'Asia/Jerusalem',
          google_email: 'student@example.com',
        },
        { onConflict: 'profile_id' },
      );

      expect(error).toBeNull();
    });

    it('lets the service role read it back', async () => {
      const { data, error } = await admin
        .from('calendar_connections')
        .select('access_token, refresh_token, calendar_timezone')
        .eq('profile_id', profileId)
        .maybeSingle();

      expect(error).toBeNull();
      expect(data?.access_token).toBe('test-access-token');
      expect(data?.calendar_timezone).toBe('Asia/Jerusalem');
    });

    it('lets the service role update the token, as a refresh does', async () => {
      const { error } = await admin
        .from('calendar_connections')
        .update({ access_token: 'renewed-token' })
        .eq('profile_id', profileId);

      expect(error).toBeNull();
    });

    it('hides the tokens from the student they belong to', async () => {
      // The whole reason the table has no policy for `authenticated`: a refresh
      // token is a durable Google credential, and nothing in a browser needs one.
      const asStudent = await signInAs(email);
      const { data } = await asStudent.from('calendar_connections').select('access_token');

      expect(data ?? []).toEqual([]);
    });

    it('hides them from everybody else too', async () => {
      const asOther = await signInAs(otherEmail);
      const { data } = await asOther.from('calendar_connections').select('access_token');

      expect(data ?? []).toEqual([]);
    });
  });

  describe('calendar_event_links', () => {
    it('lets the service role write a link, as the write sync does', async () => {
      const { error } = await admin.from('calendar_event_links').upsert(
        {
          meeting_id: '00000000-0000-4000-8000-000000000000',
          profile_id: profileId,
          google_event_id: 'test-event-id',
        },
        { onConflict: 'meeting_id,profile_id', ignoreDuplicates: true },
      );

      /*
       * The meeting id is deliberately fake, so this fails the foreign key — and
       * that is the point. A 23503 proves the GRANT is in place and the row was
       * actually evaluated; 42501 would mean it never got that far.
       */
      expect(error?.code).not.toBe('42501');
    });
  });

  describe('availability_slots', () => {
    it('accepts a slot shaped the way the read sync writes them', async () => {
      // Guards the column types the sync emits: a weekday integer and two
      // wall-clock times, not the int4range the feature was first specced against.
      const { error } = await admin.from('availability_slots').insert({
        profile_id: profileId,
        day_of_week: 1,
        starts_at: '08:00',
        ends_at: '22:00',
        source: 'google_calendar',
      });

      expect(error).toBeNull();

      const { data } = await admin
        .from('availability_slots')
        .select('source')
        .eq('profile_id', profileId);

      expect(data?.[0]?.source).toBe('google_calendar');
    });

    it('refuses a slot that ends before it starts', async () => {
      const { error } = await admin.from('availability_slots').insert({
        profile_id: profileId,
        day_of_week: 2,
        starts_at: '20:00',
        ends_at: '09:00',
        source: 'google_calendar',
      });

      expect(error).not.toBeNull();
    });
  });

  describe('profile_private', () => {
    it('lets the service role set the sync flag without a date of birth', async () => {
      // setSyncEnabled upserts, because a student who skipped the optional date
      // of birth has no row yet and connecting a calendar must not depend on it.
      const { error } = await admin
        .from('profile_private')
        .upsert(
          { profile_id: profileId, google_calendar_sync_enabled: true },
          { onConflict: 'profile_id' },
        );

      expect(error).toBeNull();
    });

    it('shows the student their own flag', async () => {
      const asStudent = await signInAs(email);
      const { data } = await asStudent
        .from('profile_private')
        .select('google_calendar_sync_enabled')
        .eq('profile_id', profileId)
        .maybeSingle();

      expect(data?.google_calendar_sync_enabled).toBe(true);
    });
  });
});
