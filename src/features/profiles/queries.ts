/**
 * File:        src/features/profiles/queries.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Reads for a student's profile page.
 *
 *              Every query runs as the signed-in student. That is what makes the
 *              privacy rule hold without this file having to think about it: the
 *              ratings SELECT policy returns a negative row only to its author, so
 *              the positive-connections read below cannot pick one up even though it
 *              does not filter on sentiment itself. The filter is there anyway, as
 *              a second layer — but the database is the one that decides.
 * Version:     0.18.0
 *
 * Modifications:
 *     0.18.0 - 2026-08-10 - Initial implementation (Phase 6)
 */

import 'server-only';

import { createClient, requireUser } from '@/lib/supabase/server';

import type {
  PositiveConnectionView,
  SharedCourseView,
  SharedGroupView,
  StudentProfileView,
} from './profile-view';

/**
 * A student's profile as one viewer sees it.
 *
 * Null when the profile is not visible to the caller — another university, or a
 * student who turned discoverability off and has no connection to them. The page
 * turns that into a 404, so a guessed id cannot confirm that someone exists.
 *
 * @param profileId - The student to show.
 * @returns The profile, or null.
 */
export async function getStudentProfile(
  profileId: string,
): Promise<StudentProfileView | null> {
  const user = await requireUser();
  const supabase = await createClient();
  const isSelf = profileId === user.id;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select(
      'id, full_name, avatar_url, year_of_study, city, is_discoverable, onboarding_completed_at, universities(name), degrees(name, level)',
    )
    .eq('id', profileId)
    .maybeSingle();

  /* RLS already refused it, or there is nothing there. Either way: not found. */
  if (error || !profile) {
    return null;
  }

  const [
    { data: age },
    { data: preferences },
    { data: availability },
    sharedCourses,
    sharedGroups,
    positiveConnections,
    compatibility,
    ratingState,
    { data: block },
  ] = await Promise.all([
    /* Age, not date of birth. The function returns one and never the other. */
    supabase.rpc('app_profile_age_years', { target_profile_id: profileId }),
    supabase
      .from('learning_preferences')
      .select(
        'preferred_time_blocks, study_environments, study_formats, group_sizes, spoken_languages, studies_on_saturday',
      )
      .eq('profile_id', profileId)
      .maybeSingle(),
    supabase
      .from('availability_slots')
      .select('starts_at, ends_at')
      .eq('profile_id', profileId),
    getSharedCourses(supabase, user.id, profileId, isSelf),
    getSharedGroups(supabase, user.id, profileId, isSelf),
    getPositiveConnections(supabase, profileId),
    isSelf ? Promise.resolve(null) : getCompatibility(supabase, profileId),
    isSelf ? Promise.resolve(null) : getRatingState(supabase, user.id, profileId),
    /*
     * RLS narrows blocked_users to the caller's own rows, so this only ever
     * answers "have I blocked them" — never the reverse. That asymmetry is the
     * point: being blocked is not something the blocked student is told.
     */
    isSelf
      ? Promise.resolve({ data: null })
      : supabase
          .from('blocked_users')
          .select('blocked_id')
          .eq('blocker_id', user.id)
          .eq('blocked_id', profileId)
          .maybeSingle(),
  ]);

  const weeklyFreeHours = (availability ?? []).reduce((total, slot) => {
    const minutes = minutesBetween(slot.starts_at, slot.ends_at);

    return total + minutes;
  }, 0) / 60;

  return {
    id: profile.id,
    fullName: profile.full_name ?? 'Classmate',
    avatarUrl: profile.avatar_url,
    age: typeof age === 'number' ? age : null,
    yearOfStudy: profile.year_of_study,
    degreeName: profile.degrees?.name ?? null,
    degreeLevel: profile.degrees?.level ?? null,
    universityName: profile.universities?.name ?? 'their university',
    city: profile.city,
    preferredTimeBlocks: preferences?.preferred_time_blocks ?? [],
    studyEnvironments: preferences?.study_environments ?? [],
    studyFormats: preferences?.study_formats ?? [],
    groupSizes: preferences?.group_sizes ?? [],
    spokenLanguages: preferences?.spoken_languages ?? [],
    studiesOnSaturday: preferences?.studies_on_saturday ?? null,
    weeklyFreeHours: Math.round(weeklyFreeHours * 10) / 10,
    isSelf,
    sharedCourses,
    sharedGroups,
    compatibilityScore: compatibility?.score ?? null,
    compatibilityCourseCode: compatibility?.courseCode ?? null,
    positiveConnections,
    canRate: ratingState?.canRate ?? false,
    myRating: ratingState?.myRating ?? null,
    isBlocked: block !== null,
  };
}

/**
 * Minutes between two `HH:MM` times.
 *
 * @param startsAt - Start time.
 * @param endsAt   - End time.
 * @returns Whole minutes, never negative.
 */
function minutesBetween(startsAt: string, endsAt: string): number {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(':').map(Number);

    return hours * 60 + (minutes ?? 0);
  };

  return Math.max(0, toMinutes(endsAt) - toMinutes(startsAt));
}

/**
 * Courses the viewer and this student are both taking (or own courses if viewing self).
 *
 * @param supabase  - The caller's client.
 * @param viewerId  - The signed-in student.
 * @param profileId - The student being viewed.
 * @param isSelf    - True when they are the same person.
 * @returns Shared courses, or own courses on own profile.
 */
async function getSharedCourses(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerId: string,
  profileId: string,
  isSelf: boolean,
): Promise<SharedCourseView[]> {
  if (isSelf) {
    /* Fetch all of the user's own courses */
    const { data } = await supabase
      .from('enrollments')
      .select('course_offering_id, course_offerings!inner(courses!inner(code, name))')
      .eq('profile_id', profileId);

    return (data ?? [])
      .map((row) => ({
        offeringId: row.course_offering_id,
        code: row.course_offerings.courses.code,
        name: row.course_offerings.courses.name,
      }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  const { data } = await supabase
    .from('enrollments')
    .select('profile_id, course_offering_id, course_offerings!inner(courses!inner(code, name))')
    .in('profile_id', [viewerId, profileId]);

  const mine = new Set(
    (data ?? []).filter((row) => row.profile_id === viewerId).map((row) => row.course_offering_id),
  );

  return (data ?? [])
    .filter((row) => row.profile_id === profileId && mine.has(row.course_offering_id))
    .map((row) => ({
      offeringId: row.course_offering_id,
      code: row.course_offerings.courses.code,
      name: row.course_offerings.courses.name,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Study groups the viewer and this student both belong to (or own groups if viewing self).
 *
 * @param supabase  - The caller's client.
 * @param viewerId  - The signed-in student.
 * @param profileId - The student being viewed.
 * @param isSelf    - True when they are the same person.
 * @returns Shared groups, or own groups on own profile.
 */
async function getSharedGroups(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerId: string,
  profileId: string,
  isSelf: boolean,
): Promise<SharedGroupView[]> {
  if (isSelf) {
    /* Fetch all of the user's own groups */
    const { data } = await supabase
      .from('study_group_members')
      .select('group_id')
      .eq('profile_id', profileId);

    const myGroupIds = (data ?? []).map((row) => row.group_id);

    if (myGroupIds.length === 0) {
      return [];
    }

    const { data: groups } = await supabase
      .from('study_groups')
      .select('id, name, study_group_members(profile_id)')
      .in('id', myGroupIds);

    return (groups ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      memberCount: (group.study_group_members as Array<{ profile_id: string }>).length,
    }));
  }

  const { data } = await supabase
    .from('study_group_members')
    .select('group_id, profile_id')
    .in('profile_id', [viewerId, profileId]);

  const mine = new Set(
    (data ?? []).filter((row) => row.profile_id === viewerId).map((row) => row.group_id),
  );
  const shared = [
    ...new Set(
      (data ?? [])
        .filter((row) => row.profile_id === profileId && mine.has(row.group_id))
        .map((row) => row.group_id),
    ),
  ];

  if (shared.length === 0) {
    return [];
  }

  const { data: groups } = await supabase
    .from('study_groups')
    .select('id, name, study_group_members(profile_id)')
    .in('id', shared);

  return (groups ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    memberCount: (group.study_group_members as Array<{ profile_id: string }>).length,
  }));
}

/**
 * Public positive connections for a student.
 *
 * The `sentiment` filter is a second layer, not the protection: the SELECT policy
 * would not return a negative row to anyone but its author regardless. Both are
 * here so that a change to either one still leaves the promise intact.
 *
 * @param supabase  - The caller's client.
 * @param profileId - The student being viewed.
 * @returns Positive connections, newest first.
 */
async function getPositiveConnections(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
): Promise<PositiveConnectionView[]> {
  const { data } = await supabase
    .from('study_ratings')
    .select(
      'rater_id, created_at, sentiment, rater:profiles!study_ratings_rater_id_fkey(full_name, avatar_url), course_offerings(courses(code))',
    )
    .eq('ratee_id', profileId)
    .eq('sentiment', 'positive')
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => ({
    raterId: row.rater_id,
    raterName:
      (row.rater as { full_name: string | null } | null)?.full_name ?? 'A classmate',
    raterAvatarUrl: (row.rater as { avatar_url: string | null } | null)?.avatar_url ?? null,
    courseCode:
      (row.course_offerings as { courses: { code: string } | null } | null)?.courses?.code ??
      null,
    ratedAt: row.created_at,
  }));
}

/**
 * The viewer's compatibility with this student.
 *
 * Reuses `rpc_find_candidates`, which is the only thing that should ever compute a
 * score — a second implementation here would be free to disagree with the ranking
 * on the matches screen. Takes the best of their shared courses, because a pair can
 * score differently per course now that preferences are per-course.
 *
 * @param supabase  - The caller's client.
 * @param profileId - The student being viewed.
 * @returns The score and the course it came from, or null.
 */
async function getCompatibility(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profileId: string,
): Promise<{ score: number; courseCode: string } | null> {
  const { data } = await supabase.rpc('rpc_find_candidates', { p_limit: 200 });

  const rows = (data ?? []).filter((row) => row.candidate_id === profileId);

  if (rows.length === 0) {
    /*
     * No row is meaningful rather than missing: they may share no course, or a
     * negative rating may have excluded the pair. The page says "not scored"
     * rather than inventing a zero.
     */
    return null;
  }

  const best = rows.reduce((top, row) =>
    Number(row.rule_score) > Number(top.rule_score) ? row : top,
  );

  return { score: Number(best.rule_score), courseCode: best.course_code };
}

/**
 * Whether the viewer may rate this student, and what they said last time.
 *
 * ASKS THE DATABASE THE SAME QUESTION THE POLICY ASKS, rather than reimplementing
 * it. Phase 7D moved the rule from "you have a conversation" to "you finished a
 * meeting together that neither of you cancelled", and it is enforced by both an
 * INSERT policy and a trigger. A second copy of that condition written in
 * TypeScript would be one schema change away from offering a button that the
 * database then refuses — which is exactly the permission error this gate exists
 * to prevent.
 *
 * @param supabase  - The caller's client.
 * @param viewerId  - The signed-in student.
 * @param profileId - The student being viewed.
 * @returns Whether rating is possible, and the viewer's existing rating.
 */
async function getRatingState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  viewerId: string,
  profileId: string,
): Promise<{ canRate: boolean; myRating: 'positive' | 'negative' | null }> {
  const [{ data: metThem }, { data: rating }] = await Promise.all([
    supabase.rpc('app_shared_completed_meeting', {
      profile_a: viewerId,
      profile_b: profileId,
    }),
    supabase
      .from('study_ratings')
      .select('sentiment')
      .eq('rater_id', viewerId)
      .eq('ratee_id', profileId)
      .maybeSingle(),
  ]);

  return {
    canRate: metThem === true,
    myRating: (rating?.sentiment as 'positive' | 'negative' | null) ?? null,
  };
}
