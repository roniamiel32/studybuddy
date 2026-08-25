/**
 * File:        src/app/(app)/courses/[offeringId]/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: One course, as an entity profile.
 *
 *              THE SAME SHAPE AS A STUDENT, and that is the whole redesign. The
 *              gradient header, the two columns, a widget on the left and a wall
 *              on the right — a course is a thing you arrive at and act on, like
 *              a person, so it is laid out like one and a student learns the
 *              shape once.
 *
 *              WHAT MOVED. The course facts that used to fill a sidebar card are
 *              in the header now, where the profile puts a degree and a year: a
 *              code and a faculty are identity, not settings, and giving them a
 *              panel of their own said otherwise. The preferences summary stays
 *              in the left column under the members, because it IS a setting.
 *
 *              WHAT LEFT. Study groups and the match grid moved down the page
 *              rather than out of it — the wall is the reason to come back, and
 *              it now gets the first screen.
 * Version:     0.25.0
 *
 * Modifications:
 *     0.25.0 - 2026-08-13 - Entity-profile redesign, course wall (Phase 9C)
 *     0.15.0 - 2026-08-10 - Study groups on the course page (Phase 5)
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, TriangleAlert } from 'lucide-react';

import { CreateGroupPanel } from '@/components/groups/create-group-panel';
import { GroupCard } from '@/components/groups/group-card';
import { CourseHeader } from '@/components/courses/course-header';
import { CourseMembersWidget } from '@/components/courses/course-members-widget';
import { CourseWallFeed } from '@/components/courses/course-wall-feed';
import { getCourseMembers, getCoursePosts } from '@/features/course-wall/queries';
import { getGlobalPreferences, getMyCourse } from '@/features/courses/queries';
import { getCourseGroups } from '@/features/groups/queries';

export const metadata: Metadata = { title: 'Course' };

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
   * would confirm that a course exists to someone guessing ids. This is also
   * what lets the wall composer be unconditional: nobody who cannot post can
   * reach this page.
   */
  if (!course || !globals) {
    notFound();
  }

  const [groups, posts, memberPage] = await Promise.all([
    getCourseGroups(offeringId),
    getCoursePosts(offeringId),
    getCourseMembers(offeringId),
  ]);

  return (
    <>
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
          <li className="text-brand text-label-sm">{course.name}</li>
        </ol>
      </nav>

      <CourseHeader
        offeringId={course.offeringId}
        name={course.name}
        faculty={course.faculty}
        classmateCount={course.classmateCount}
        globals={globals}
        override={course.override}
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* ---- Left: who is here, and study groups --------------------- */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          <CourseMembersWidget
            offeringId={course.offeringId}
            courseName={course.name}
            initialMembers={memberPage.members}
            initialHasMore={memberPage.hasMore}
            classmateCount={course.classmateCount}
          />

          <section aria-labelledby="groups-heading" className="clay-card p-5">
            <h2 id="groups-heading" className="font-heading text-headline-md">
              Study groups
            </h2>

            <div className="my-4">
              {groups.length > 0 ? (
                <ul aria-label="Study groups" className="flex flex-col gap-4">
                  {groups.map((group) => (
                    <GroupCard key={group.id} group={group} />
                  ))}
                </ul>
              ) : (
                <p className="text-on-surface-variant bg-surface-container rounded-md p-4 text-body-md text-pretty">
                  No study groups for {course.name} yet. Create the first one and classmates
                  can ask to join.
                </p>
              )}
            </div>

            <div className="mt-2">
              <CreateGroupPanel offeringId={offeringId} courseName={course.name} />
            </div>
          </section>

          {course.source === 'placeholder' || course.source === 'ai_generated' ? (
            <p className="bg-sunset-fixed/60 text-sunset-deep flex items-start gap-2 rounded-md p-3 text-label-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                This course was not confirmed against your university&apos;s syllabus, so its
                name may differ from the real one.
              </span>
            </p>
          ) : null}
        </div>

        {/* ---- Right: the wall --------------------------------------------- */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          <CourseWallFeed
            offeringId={course.offeringId}
            courseName={course.name}
            posts={posts}
          />
        </div>
      </div>
    </>
  );
}