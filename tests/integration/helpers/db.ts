/**
 * File:        tests/integration/helpers/db.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Shared plumbing for tests that run against the local Supabase
 *              stack. Uses the service role, so RLS is bypassed — these tests
 *              are about schema invariants (constraints, triggers, functions).
 *              RLS itself is tested separately in Phase 1b with real user
 *              sessions, which is the only way to test it honestly.
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - seedCompletedMeeting, for the Phase 7D rating rule
 *     0.3.0 - 2026-08-03 - Initial helpers (Phase 1a)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database.types';

export const RUNI_ID = '11111111-1111-4111-8111-111111111111';
export const TAU_ID = '22222222-2222-4222-8222-222222222222';
export const RUNI_CURRENT_TERM_ID = 'dddd0002-0000-4000-8000-000000000002';
export const RUNI_PAST_TERM_ID = 'dddd0001-0000-4000-8000-000000000001';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Password every test student is created with. */
export const TEST_PASSWORD = 'test-password-1234';

/**
 * Reports whether the local stack is configured and reachable.
 *
 * @returns True when the URL, service key and anon key are all present.
 */
export function hasLocalDb(): boolean {
  return Boolean(url && serviceKey && anonKey);
}

/**
 * Builds an unauthenticated client, carrying the anon key only.
 *
 * @returns A Supabase client with no session.
 * @throws Error if the local stack is not configured.
 */
export function anonDb(): SupabaseClient<Database> {
  if (!url || !anonKey) {
    throw new Error('Local Supabase is not configured. Run `npm run db:start`.');
  }

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      /*
       * A unique storage key per client, which is not cosmetic. Supabase
       * clients sharing a key share a session slot, so signing in as a second
       * student can overwrite the first client's session — and a security test
       * that unknowingly runs as the wrong user passes while proving nothing.
       */
      storageKey: `sb-test-${crypto.randomUUID()}`,
    },
  });
}

/**
 * Signs in as a student and returns a client bound to their session.
 *
 * This is the only honest way to test RLS: the service-role client used
 * elsewhere bypasses policies entirely, so a suite built on it would pass no
 * matter how the policies were written.
 *
 * @param email - The student's address.
 * @returns A Supabase client authenticated as that student.
 * @throws Error if sign-in fails.
 */
export async function signInAs(email: string): Promise<SupabaseClient<Database>> {
  const client = anonDb();

  const { error } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });

  if (error) {
    throw new Error(`signInAs(${email}) failed: ${error.message}`);
  }

  return client;
}

/**
 * Builds a service-role client for schema testing.
 *
 * @returns A Supabase client that bypasses RLS.
 * @throws Error if the local stack is not configured.
 */
export function adminDb(): SupabaseClient<Database> {
  if (!url || !serviceKey) {
    throw new Error(
      'Local Supabase is not configured. Run `npm run db:start` and copy the ' +
        'printed values into .env.local.',
    );
  }

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Creates a confirmed auth user, which fires handle_new_user() and therefore
 * creates the matching profile row.
 *
 * @param db    - Service-role client.
 * @param email - Address whose domain determines the tenant.
 * @returns The new user's id.
 * @throws Error if creation fails, with the database message attached.
 */
export async function createStudent(
  db: SupabaseClient<Database>,
  email: string,
): Promise<string> {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  if (error || !data.user) {
    throw new Error(`createStudent(${email}) failed: ${error?.message ?? 'no user returned'}`);
  }

  return data.user.id;
}

/**
 * Deletes auth users created by a test. Profiles cascade from auth.users.
 *
 * @param db  - Service-role client.
 * @param ids - User ids to remove; falsy entries are ignored.
 * @returns Nothing.
 */
export async function deleteStudents(
  db: SupabaseClient<Database>,
  ids: Array<string | undefined>,
): Promise<void> {
  for (const id of ids) {
    if (id) {
      await db.auth.admin.deleteUser(id);
    }
  }
}

/**
 * Seeds a meeting that has already finished, with everyone marked as going.
 *
 * The Phase 7D rating rule needs one of these, and it cannot be inserted
 * directly: `check_meeting_consistency` refuses a meeting that starts in the
 * past. That check is deliberately INSERT-only — a session can legitimately be
 * moved, and by the time it has happened the row has to describe the past — so
 * the fixture books it in the future and then backdates it.
 *
 * Deliberately not a hole in the schema. The backdate runs as the service role
 * and only moves the times; every rule the rating rests on — that both students
 * were attendees, and that neither cancelled — is still established the normal
 * way and still enforced by triggers this cannot reach.
 *
 * @param db      - Service-role client.
 * @param options - The chat it belongs to, and who was there.
 * @returns The meeting id.
 * @throws Error if any step fails, with the database message attached.
 */
export async function seedCompletedMeeting(
  db: SupabaseClient<Database>,
  options: {
    universityId: string;
    participants: string[];
    conversationId?: string;
    groupId?: string;
    title?: string;
    /** How long ago it finished. Defaults to two hours. */
    endedHoursAgo?: number;
  },
): Promise<string> {
  const { data: meeting, error } = await db
    .from('meetings')
    .insert({
      university_id: options.universityId,
      conversation_id: options.conversationId ?? null,
      group_id: options.groupId ?? null,
      created_by: options.participants[0],
      title: options.title ?? 'Revision session',
      starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      ends_at: new Date(Date.now() + 93_600_000).toISOString(),
    })
    .select('id')
    .single();

  if (error || !meeting) {
    throw new Error(`seedCompletedMeeting insert failed: ${error?.message}`);
  }

  const attendees = await db.from('meeting_attendees').insert(
    options.participants.map((id) => ({
      meeting_id: meeting.id,
      profile_id: id,
      rsvp: 'going' as const,
    })),
  );

  if (attendees.error) {
    throw new Error(`seedCompletedMeeting attendees failed: ${attendees.error.message}`);
  }

  const endedHoursAgo = options.endedHoursAgo ?? 2;
  const endsAt = new Date(Date.now() - endedHoursAgo * 3_600_000);
  const startsAt = new Date(endsAt.getTime() - 7_200_000);

  const moved = await db
    .from('meetings')
    .update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
    .eq('id', meeting.id);

  if (moved.error) {
    throw new Error(`seedCompletedMeeting backdate failed: ${moved.error.message}`);
  }

  return meeting.id;
}

/**
 * Resolves a course offering id from its course code and term.
 *
 * @param db     - Service-role client.
 * @param code   - Course code, e.g. 'CS-3040'.
 * @param termId - Term the offering belongs to.
 * @returns The offering id.
 * @throws Error if no such offering exists.
 */
export async function offeringIdByCode(
  db: SupabaseClient<Database>,
  code: string,
  termId: string,
): Promise<string> {
  const { data, error } = await db
    .from('course_offerings')
    .select('id, courses!inner(code)')
    .eq('term_id', termId)
    .eq('courses.code', code)
    .single();

  if (error || !data) {
    throw new Error(`No offering for ${code} in term ${termId}: ${error?.message}`);
  }

  return data.id;
}
