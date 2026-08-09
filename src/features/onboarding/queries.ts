/**
 * File:        src/features/onboarding/queries.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Reads backing the onboarding flow. Every query here runs as the
 *              signed-in student, so RLS has already scoped the results to
 *              their university before this code sees a row.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import 'server-only';

import { createClient, requireUser } from '@/lib/supabase/server';

export interface TrackOption {
  id: string;
  code: string;
  name: string;
}

export interface OfferingOption {
  offeringId: string;
  courseId: string;
  code: string;
  name: string;
  faculty: string | null;
  /** Tracks this course belongs to; a course can belong to several. */
  trackIds: string[];
}

export interface OnboardingProfile {
  fullName: string | null;
  studyTrackId: string | null;
  yearOfStudy: number | null;
  avatarUrl: string | null;
  universityName: string;
  onboardingCompletedAt: string | null;
  /** The signed-in address, used to suggest a display name on step 1. */
  email: string;
}

/**
 * Loads the signed-in student's profile plus their institution's name.
 *
 * @returns The profile fields onboarding needs.
 * @throws AppError when not signed in, or when the profile row is missing.
 */
export async function getOnboardingProfile(): Promise<OnboardingProfile> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select(
      'full_name, study_track_id, year_of_study, avatar_url, onboarding_completed_at, universities(name)',
    )
    .eq('id', user.id)
    .single();

  if (error || !data) {
    throw new Error(`Profile not found for ${user.id}: ${error?.message}`);
  }

  return {
    fullName: data.full_name,
    studyTrackId: data.study_track_id,
    yearOfStudy: data.year_of_study,
    avatarUrl: data.avatar_url,
    universityName: data.universities?.name ?? 'your university',
    onboardingCompletedAt: data.onboarding_completed_at,
    email: user.email ?? '',
  };
}

/**
 * Lists the study tracks offered by the student's own university.
 *
 * The university itself is never asked for — it is derived from the email
 * domain at signup — so this list is already narrowed to one institution by
 * RLS.
 *
 * @returns Tracks, alphabetically.
 */
export async function getStudyTracks(): Promise<TrackOption[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('study_tracks')
    .select('id, code, name')
    .order('name');

  return data ?? [];
}

/**
 * Lists every course offered in the current term at the student's university,
 * with the tracks each belongs to.
 *
 * Deliberately returns the whole current-term catalog in one query and lets the
 * picker filter it in the browser. At a realistic catalog size that is a single
 * round trip and instant filtering as the student types, rather than a request
 * per keystroke. A catalog of thousands would want this pushed into SQL.
 *
 * Note what is NOT filtered here: year of study. A student extending their
 * degree or taking a course off-sequence must still find it.
 *
 * @returns Offerings for the current term.
 */
export async function getCurrentTermOfferings(): Promise<OfferingOption[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('course_offerings')
    .select(
      `id,
       terms!inner(is_current),
       courses!inner(id, code, name, faculty, course_tracks(track_id))`,
    )
    .eq('terms.is_current', true);

  return (data ?? [])
    .map((offering) => ({
      offeringId: offering.id,
      courseId: offering.courses.id,
      code: offering.courses.code,
      name: offering.courses.name,
      faculty: offering.courses.faculty,
      trackIds: (offering.courses.course_tracks ?? []).map((link) => link.track_id),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Returns the course offering ids the student is already enrolled in.
 *
 * Lets a student who leaves onboarding half-finished come back to their
 * previous selection rather than starting again.
 *
 * @returns Offering ids.
 */
export async function getMyEnrolledOfferingIds(): Promise<string[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('enrollments')
    .select('course_offering_id')
    .eq('profile_id', user.id);

  return (data ?? []).map((row) => row.course_offering_id);
}

/**
 * Returns the student's saved preferences, if they have completed step 3.
 *
 * @returns The preference row, or null.
 */
export async function getMyPreferences() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('learning_preferences')
    .select(
      'preferred_time_blocks, study_environments, group_sizes, studies_on_saturday, spoken_languages',
    )
    .eq('profile_id', user.id)
    .maybeSingle();

  return data;
}

/**
 * Returns the student's own availability slots.
 *
 * @returns Slots with day and start time.
 */
export async function getMyAvailability() {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('availability_slots')
    .select('day_of_week, starts_at, ends_at, source')
    .eq('profile_id', user.id)
    .order('day_of_week');

  return data ?? [];
}
