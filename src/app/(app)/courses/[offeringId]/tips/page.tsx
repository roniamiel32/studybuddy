/**
 * File:        src/app/(app)/courses/[offeringId]/tips/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: What the class wishes it had known — the course's tips.
 *
 *              A SUB-PAGE BEHIND "COURSE TIPS", the same way the study data sits
 *              behind "Learn more" on a profile. The wall is what is happening in
 *              the course now and belongs on the first screen; tips are what
 *              outlives the semester, and you go looking for them.
 *
 *              THE HEADER IS THE SAME COMPONENT the course page renders, so the
 *              code badge and the title lead back rather than nowhere — and it
 *              works out which of the two views it is on from the path, so this
 *              page cannot forget to tell it.
 * Version:     0.25.0
 *
 * Modifications:
 *     0.25.0 - 2026-08-13 - Initial implementation (Phase 9C)
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CourseHeader } from '@/components/courses/course-header';
import { CourseTipsFeed } from '@/components/courses/course-tips-feed';
import { getCourseTips } from '@/features/course-wall/queries';
import { getGlobalPreferences, getMyCourse } from '@/features/courses/queries';

export const metadata: Metadata = { title: 'Course tips' };

/**
 * Renders the tips for one course.
 *
 * @param params - Route parameters carrying the course offering id.
 * @returns The page element.
 */
export default async function CourseTipsPage({
  params,
}: {
  params: Promise<{ offeringId: string }>;
}) {
  const { offeringId } = await params;

  const [course, globals] = await Promise.all([getMyCourse(offeringId), getGlobalPreferences()]);

  if (!course || !globals) {
    notFound();
  }

  const tips = await getCourseTips(offeringId);

  return (
    <>
      <CourseHeader
        offeringId={course.offeringId}
        name={course.name}
        code={course.code}
        faculty={course.faculty}
        classmateCount={course.classmateCount}
        globals={globals}
        override={course.override}
      />

      <div className="mb-6">
        <h2 className="font-heading text-headline-md">Course tips</h2>
        <p className="text-on-surface-variant mt-1 max-w-2xl text-body-md text-pretty">
          Advice from students taking {course.code} or who have taken it, with the
          best-rated first. Rate a tip and it moves for everyone.
        </p>
      </div>

      {/* One column rather than two: a tip is a paragraph, and a paragraph in a
          narrow column beside an empty one reads as a mistake. */}
      <div className="max-w-3xl">
        <CourseTipsFeed
          offeringId={course.offeringId}
          courseCode={course.code}
          tips={tips}
        />
      </div>
    </>
  );
}
