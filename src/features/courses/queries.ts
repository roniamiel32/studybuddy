/**
 * File:        src/features/courses/queries.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Reads for the Courses grid and the per-course page.
 *
 *              Every query runs as the signed-in student, so RLS has already
 *              scoped the rows before this code sees one.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

import 'server-only';

import { createClient, requireUser } from '@/lib/supabase/server';

import type {
  CoursePreferenceValues,
  EnrolledCourseView,
} from './course-view';

/** One enrolment, with the course behind it and the override on it. */
const ENROLLMENT_SELECT = `
  course_offering_id,
  intent,
  preferred_time_blocks,
  study_environments,
  study_formats,
  group_sizes,
  course_offerings!inner (
    id,
    terms!inner ( is_current ),
    courses!inner ( id, code, name, faculty, source )
  )
`;

interface EnrollmentRow {
  course_offering_id: string;
  intent: string;
  preferred_time_blocks: string[] | null;
  study_environments: string[] | null;
  study_formats: string[] | null;
  group_sizes: string[] | null;
  course_offerings: {
    id: string;
    terms: { is_current: boolean } | null;
    courses: {
      id: string;
      code: string;
      name: string;
      faculty: string | null;
      source: string;
    } | null;
  } | null;
}

/**
 * Shapes an enrolment row for the UI.
 *
 * @param row            - The joined enrolment row.
 * @param classmateCount - Classmates in this course.
 * @returns The course as the grid consumes it.
 */
function toCourseView(row: EnrollmentRow, classmateCount: number): EnrolledCourseView {
  const course = row.course_offerings?.courses;

  return {
    offeringId: row.course_offering_id,
    courseId: course?.id ?? '',
    code: course?.code ?? '',
    name: course?.name ?? 'Course',
    faculty: course?.faculty ?? null,
    source: course?.source ?? 'seed',
    intent: row.intent,
    classmateCount,
    override: {
      preferredTimeBlocks: row.preferred_time_blocks,
      studyEnvironments: row.study_environments,
      studyFormats: row.study_formats,
      groupSizes: row.group_sizes,
    },
  };
}

/**
 * The student's courses this term, with classmate counts.
 *
 * The counts come from one grouped read rather than a query per card: a student
 * with eight courses would otherwise cost eight round trips to render a grid.
 *
 * @returns Enrolled courses, by course code.
 */
export async function getMyCourses(): Promise<EnrolledCourseView[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('enrollments')
    .select(ENROLLMENT_SELECT)
    .eq('profile_id', user.id)
    .eq('course_offerings.terms.is_current', true);

  if (error || !data) {
    return [];
  }

  const rows = data as unknown as EnrollmentRow[];
  const offeringIds = rows.map((row) => row.course_offering_id);

  /*
   * Classmates per course, in one read. RLS limits this to enrolments the student
   * may see, which is exactly the population the matching engine draws from — so
   * the number on the card is the number the course page can actually show.
   */
  const counts = new Map<string, number>();

  if (offeringIds.length > 0) {
    const { data: classmates } = await supabase
      .from('enrollments')
      .select('course_offering_id, profile_id')
      .in('course_offering_id', offeringIds)
      .neq('profile_id', user.id);

    for (const row of classmates ?? []) {
      counts.set(row.course_offering_id, (counts.get(row.course_offering_id) ?? 0) + 1);
    }
  }

  return rows
    .map((row) => toCourseView(row, counts.get(row.course_offering_id) ?? 0))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * One of the student's courses, or null when it is not theirs.
 *
 * Null rather than an error for a course they are not enrolled in: the page turns
 * it into a 404, so a guessed offering id cannot confirm that a course exists.
 *
 * @param offeringId - The course offering to read.
 * @returns The course, or null.
 */
export async function getMyCourse(offeringId: string): Promise<EnrolledCourseView | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('enrollments')
    .select(ENROLLMENT_SELECT)
    .eq('profile_id', user.id)
    .eq('course_offering_id', offeringId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const { count } = await supabase
    .from('enrollments')
    .select('profile_id', { count: 'exact', head: true })
    .eq('course_offering_id', offeringId)
    .neq('profile_id', user.id);

  return toCourseView(data as unknown as EnrollmentRow, count ?? 0);
}

/**
 * The student's global preferences, in the shape the override logic expects.
 *
 * @returns The four overridable preferences, or null when onboarding is unfinished.
 */
export async function getGlobalPreferences(): Promise<CoursePreferenceValues | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('learning_preferences')
    .select('preferred_time_blocks, study_environments, study_formats, group_sizes')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (!data) {
    return null;
  }

  return {
    preferredTimeBlocks: data.preferred_time_blocks,
    studyEnvironments: data.study_environments,
    studyFormats: data.study_formats,
    groupSizes: data.group_sizes,
  };
}

/**
 * Courses on the student's degree they are NOT yet enrolled in.
 *
 * Feeds the "add a course" picker. Scoped to the degree for the same reason step
 * 2 of onboarding is: a Law student has no business being offered the Computer
 * Science catalog.
 *
 * @returns Offerings available to add.
 */
export async function getAddableOfferings(): Promise<
  Array<{ offeringId: string; code: string; name: string }>
> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('degree_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.degree_id) {
    return [];
  }

  const [{ data: offerings }, { data: mine }] = await Promise.all([
    supabase
      .from('course_offerings')
      .select('id, terms!inner(is_current), courses!inner(code, name, degree_id)')
      .eq('courses.degree_id', profile.degree_id)
      .eq('terms.is_current', true),
    supabase.from('enrollments').select('course_offering_id').eq('profile_id', user.id),
  ]);

  const enrolled = new Set((mine ?? []).map((row) => row.course_offering_id));

  return (offerings ?? [])
    .filter((row) => !enrolled.has(row.id))
    .map((row) => ({
      offeringId: row.id,
      code: row.courses.code,
      name: row.courses.name,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
