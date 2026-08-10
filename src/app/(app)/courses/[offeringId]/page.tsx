/**
 * File:        src/app/(app)/courses/[offeringId]/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: One course: who else is taking it, and the preferences that govern
 *              it.
 *
 *              Follows the supplied course-dashboard design — breadcrumb, title,
 *              a sidebar of course facts, and a grid of classmates beside it. The
 *              design's study groups arrived in Phase 5 and are listed here. What
 *              is still deliberately absent is meeting times, room and lecturer:
 *              the schema has no columns for them (design conflicts C8/C9).
 *
 *              The matches here are scoped to THIS course by passing the offering
 *              id to `rpc_find_candidates`, which has accepted that argument since
 *              Phase 2 precisely so this screen could exist.
 * Version:     0.15.0
 *
 * Modifications:
 *     0.15.0 - 2026-08-10 - Study groups on the course page (Phase 5)
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, TriangleAlert, Users } from 'lucide-react';

import { CreateGroupPanel } from '@/components/groups/create-group-panel';
import { GroupCard } from '@/components/groups/group-card';
import { CoursePreferencesDialog } from '@/components/courses/course-preferences-dialog';
import { MatchCard } from '@/components/matching/match-card';
import { Chip } from '@/components/ui/chip';
import { bannerFor } from '@/components/courses/course-card';
import {
  countDifferences,
  hasOverride,
  resolveCoursePreferences,
} from '@/features/courses/course-view';
import { getGlobalPreferences, getMyCourse } from '@/features/courses/queries';
import { getCourseGroups } from '@/features/groups/queries';
import { getMatches } from '@/features/matching/queries';
import {
  ENVIRONMENT_OPTIONS,
  GROUP_SIZE_OPTIONS,
  STUDY_FORMAT_OPTIONS,
  TIME_BLOCK_OPTIONS,
} from '@/config/onboarding';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Course' };

/** Turns stored values into the labels a student recognises. */
function labelsFor(values: string[], options: readonly { value: string; label: string }[]): string {
  return (
    values
      .map((value) => options.find((option) => option.value === value)?.label ?? value)
      .join(', ') || 'None'
  );
}

/**
 * Renders one course's page.
 *
 * @param params - Route parameters carrying the course offering id.
 * @returns The page element.
 */
export default async function CoursePage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const { offeringId } = await params;

  const [course, globals] = await Promise.all([getMyCourse(offeringId), getGlobalPreferences()]);

  /*
   * Not enrolled, or no such offering — both are a 404. Telling the two apart
   * would confirm that a course exists to someone guessing ids.
   */
  if (!course || !globals) {
    notFound();
  }

  const [matches, groups] = await Promise.all([
    getMatches({ courseOfferingId: offeringId, limit: 24 }),
    getCourseGroups(offeringId),
  ]);

  const inForce = resolveCoursePreferences(globals, course.override);
  const customised = hasOverride(course.override);
  const differences = countDifferences(globals, course.override);

  const summary = [
    { label: 'Meeting', values: inForce.studyFormats, options: STUDY_FORMAT_OPTIONS },
    { label: 'Time of day', values: inForce.preferredTimeBlocks, options: TIME_BLOCK_OPTIONS },
    { label: 'Working style', values: inForce.studyEnvironments, options: ENVIRONMENT_OPTIONS },
    { label: 'Group size', values: inForce.groupSizes, options: GROUP_SIZE_OPTIONS },
  ];

  return (
    <>
      {/* ---- Breadcrumb and title, straight from the design ------------------ */}
      <nav aria-label="Breadcrumb" className="mb-2">
        <ol className="text-on-surface-variant flex items-center gap-2">
          <li>
            <Link href="/courses" className="hover:text-brand text-label-sm transition-colors">
              Your courses
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="size-4" />
          </li>
          <li className="text-brand text-label-sm">{course.code}</li>
        </ol>
      </nav>

      <div className="mb-8">
        <h1 className="font-heading text-[28px] leading-9 text-balance sm:text-headline-lg">
          {course.name}
        </h1>
        <p className="text-on-surface-variant mt-2 max-w-2xl text-body-md text-pretty">
          {matches.length > 0
            ? 'Classmates in this course, ranked by the preferences that apply here.'
            : 'Nobody else has joined this course yet.'}
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* ---- Sidebar ------------------------------------------------------ */}
        <aside className="flex flex-col gap-6 lg:col-span-4">
          <section aria-labelledby="course-info-heading" className="clay-card overflow-hidden p-0">
            <span
              aria-hidden="true"
              className={cn('block h-16 bg-gradient-to-br', bannerFor(course.code))}
            />
            <div className="p-5">
              <h2 id="course-info-heading" className="font-heading text-headline-md">
                Course info
              </h2>

              <dl className="mt-4 flex flex-col gap-3">
                <div>
                  <dt className="text-outline text-label-sm">Code</dt>
                  <dd className="text-label-md">{course.code}</dd>
                </div>
                {course.faculty ? (
                  <div>
                    <dt className="text-outline text-label-sm">Faculty</dt>
                    <dd className="text-label-md">{course.faculty}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-outline text-label-sm">Classmates</dt>
                  <dd className="text-label-md">
                    {course.classmateCount === 0
                      ? 'None yet'
                      : `${course.classmateCount} ${course.classmateCount === 1 ? 'student' : 'students'}`}
                  </dd>
                </div>
              </dl>

              {course.source === 'placeholder' || course.source === 'ai_generated' ? (
                <p className="bg-sunset-fixed/60 text-sunset-deep mt-4 flex items-start gap-2 rounded-md p-3 text-label-sm">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {/*
                    * The design's sidebar lists meeting times, a room and a
                    * lecturer. None of those exist in the schema (conflicts C8 and
                    * C9), and inventing them for a course whose NAME is already
                    * unverified would compound one guess with three more.
                    */}
                  <span>
                    This course was not confirmed against your university&apos;s syllabus, so
                    its name and code may differ from the real ones.
                  </span>
                </p>
              ) : null}
            </div>
          </section>

          {/* ---- The per-course override -------------------------------------- */}
          <section aria-labelledby="course-prefs-heading" className="clay-card p-5">
            <h2 id="course-prefs-heading" className="font-heading text-headline-md">
              Preferences here
            </h2>
            <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
              {customised
                ? `${differences === 1 ? 'One answer' : `${differences} answers`} differ from your defaults for this course.`
                : 'This course uses your global preferences.'}
            </p>

            <dl className="my-4 flex flex-col gap-3">
              {summary.map((row) => (
                <div key={row.label}>
                  <dt className="text-outline text-label-sm">{row.label}</dt>
                  <dd className="text-label-md">{labelsFor(row.values, row.options)}</dd>
                </div>
              ))}
            </dl>

            <CoursePreferencesDialog
              offeringId={course.offeringId}
              courseCode={course.code}
              globals={globals}
              override={course.override}
            />
          </section>
        </aside>

        {/* ---- Study groups -------------------------------------------------- */}
        <div className="flex flex-col gap-6 lg:col-span-8">
          <section aria-labelledby="groups-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 id="groups-heading" className="font-heading text-headline-md">
                Study groups
              </h2>
              <CreateGroupPanel offeringId={offeringId} courseCode={course.code} />
            </div>

            {groups.length > 0 ? (
              <ul aria-label="Study groups" className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
                {groups.map((group) => (
                  <GroupCard key={group.id} group={group} />
                ))}
              </ul>
            ) : (
              <p className="text-on-surface-variant bg-surface-container rounded-md p-4 text-body-md text-pretty">
                No study groups for {course.code} yet. Create the first one and
                classmates can ask to join.
              </p>
            )}
          </section>

        {/* ---- Classmates --------------------------------------------------- */}
        <section aria-labelledby="partners-heading">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="partners-heading" className="font-heading text-headline-md">
              Find partners
            </h2>
            {matches.length > 0 ? (
              <Chip tone="brand">
                {matches.length} {matches.length === 1 ? 'match' : 'matches'} in {course.code}
              </Chip>
            ) : null}
          </div>

          {matches.length > 0 ? (
            <ul className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
              {matches.map((match) => (
                <MatchCard key={match.candidateId} match={match} />
              ))}
            </ul>
          ) : (
            <div className="clay-card flex flex-col items-center p-8 text-center">
              <span className="bg-brand-fixed text-brand mb-4 flex size-14 items-center justify-center rounded-full">
                <Users className="size-7" aria-hidden="true" />
              </span>
              <h3 className="font-heading text-headline-md">No matches in this course yet</h3>
              <p className="text-on-surface-variant mt-2 max-w-md text-body-md text-pretty">
                {course.classmateCount > 0
                  ? /*
                     * The honest distinction: classmates exist but none passed the
                     * filters. Study format is strict, so the override above is the
                     * most likely reason — and it is the thing they can change.
                     */
                    'Classmates are enrolled, but none match the preferences that apply here. Try widening them above.'
                  : 'You are early. Check back once more of your class has signed up.'}
              </p>
            </div>
          )}
        </section>
        </div>
      </div>
    </>
  );
}
