/**
 * File:        src/features/onboarding/queries.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Reads backing the onboarding flow. Every query here runs as the
 *              signed-in student, so RLS has already scoped the results to
 *              their university before this code sees a row.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - isDiscoverable and degreeName for the Profile tab
 *     0.11.0 - 2026-08-09 - CourseSource shared with the courses feature
 *     0.10.0 - 2026-08-09 - getDegreeOfferings replaces the university-wide read
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

import 'server-only';

import type { CourseSource } from '@/features/courses/catalog-schema';
import { createClient, requireUser } from '@/lib/supabase/server';

export interface DegreeOption {
  id: string;
  name: string;
  level: 'bachelors' | 'masters' | 'phd';
}

export interface OfferingOption {
  offeringId: string;
  courseId: string;
  code: string;
  name: string;
  faculty: string | null;
  /** Where the course came from; see UNVERIFIED_SOURCES. */
  source: CourseSource;
}

export interface OnboardingProfile {
  fullName: string | null;
  degreeId: string | null;
  city: string | null;
  /** Read from the private table; only ever the owner's own. */
  dateOfBirth: string | null;
  yearOfStudy: number | null;
  avatarUrl: string | null;
  universityName: string;
  onboardingCompletedAt: string | null;
  /** The signed-in address, used to suggest a display name on step 1. */
  email: string;
  /** Whether classmates can see them at all. Editable from the Profile tab. */
  isDiscoverable: boolean;
  /** Shown read-only on the Profile tab; the degree decides the course catalog. */
  degreeName: string | null;
  /**
   * When they were last asked whether they had moved up a year, null if never.
   * Drives the autumn prompt — see features/profile/academic-year.ts.
   */
  lastYearPromptDate: string | null;
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
      'full_name, degree_id, city, year_of_study, avatar_url, onboarding_completed_at, is_discoverable, last_year_prompt_date, universities(name), degrees(name)',
    )
    .eq('id', user.id)
    .single();

  if (error || !data) {
    throw new Error(`Profile not found for ${user.id}: ${error?.message}`);
  }

  /* Separate table, and readable only by its owner. */
  const { data: privateRow } = await supabase
    .from('profile_private')
    .select('date_of_birth')
    .eq('profile_id', user.id)
    .maybeSingle();

  return {
    fullName: data.full_name,
    degreeId: data.degree_id,
    city: data.city,
    dateOfBirth: privateRow?.date_of_birth ?? null,
    yearOfStudy: data.year_of_study,
    avatarUrl: data.avatar_url,
    universityName: data.universities?.name ?? 'your university',
    onboardingCompletedAt: data.onboarding_completed_at,
    email: user.email ?? '',
    isDiscoverable: data.is_discoverable,
    degreeName: data.degrees?.name ?? null,
    lastYearPromptDate: data.last_year_prompt_date,
  };
}

/**
 * Lists the degrees offered by the student's own university.
 *
 * RLS has already narrowed this to one institution, so no filter is needed here
 * — and none can be forgotten.
 *
 * @returns Degrees, ordered by level then name.
 */
export async function getDegrees(): Promise<DegreeOption[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('degrees')
    .select('id, name, level')
    .order('level')
    .order('name');

  return data ?? [];
}

/**
 * Lists the current-term courses belonging to ONE degree.
 *
 * The degree filter is the fix for step 2 showing every course at the
 * university: the previous version filtered only on the current term, so a Law
 * student was shown the Computer Science catalog. An unrecognised or absent
 * degree returns nothing, which is what lets the picker ask the Smart Course API
 * to generate a list rather than silently falling back to someone else's.
 *
 * Note what is still NOT filtered: year of study. A student extending their
 * degree or taking a course off-sequence must still find it.
 *
 * @param degreeId - The student's degree, or null before step 1 is done.
 * @returns Offerings for that degree in the current term.
 */
export async function getDegreeOfferings(degreeId: string | null): Promise<OfferingOption[]> {
  if (!degreeId) {
    return [];
  }

  const supabase = await createClient();

  const { data } = await supabase
    .from('course_offerings')
    .select('id, terms!inner(is_current), courses!inner(id, code, name, faculty, degree_id, source)')
    .eq('courses.degree_id', degreeId)
    .eq('terms.is_current', true);

  return (data ?? [])
    .map((offering) => ({
      offeringId: offering.id,
      courseId: offering.courses.id,
      code: offering.courses.code,
      name: offering.courses.name,
      faculty: offering.courses.faculty,
      source: offering.courses.source,
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
      'preferred_time_blocks, study_environments, study_formats, group_sizes, studies_on_saturday, spoken_languages',
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