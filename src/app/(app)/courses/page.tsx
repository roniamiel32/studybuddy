/**
 * File:        src/app/(app)/courses/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Courses tab — the student's courses as a grid of cards, with
 *              controls to add a course or drop one.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

import { AddCoursePanel } from '@/components/courses/add-course-panel';
import { CourseCard } from '@/components/courses/course-card';
import { getAddableOfferings, getMyCourses } from '@/features/courses/queries';

export const metadata: Metadata = { title: 'Your courses' };

/**
 * Renders the Courses grid.
 *
 * @returns The page element.
 */
export default async function CoursesPage() {
  const [courses, addable] = await Promise.all([getMyCourses(), getAddableOfferings()]);

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-[28px] leading-9 text-balance sm:text-headline-lg">
            Your courses
          </h1>
          <p className="text-on-surface-variant mt-2 text-body-md text-pretty">
            {courses.length === 0
              ? 'Add the courses you are taking and we will find you partners in them.'
              : `You are enrolled in ${courses.length} course${courses.length > 1 ? 's' : ''}.`}
          </p>
        </div>

        <AddCoursePanel options={addable} />
      </div>

      {courses.length > 0 ? (
        /* aria-label names the grid, because the add-a-course picker is also a
           list of courses and "list, 12 items" tells a screen-reader user
           nothing about which one they are in. */
        <ul
          aria-label="Your courses"
          className="grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-3"
        >
          {courses.map((course) => (
            <CourseCard
              key={course.offeringId}
              course={course}
              /*
               * The last course cannot be dropped: matching is anchored to a
               * shared course, so a student with none is unmatchable. The server
               * action enforces the same rule.
               */
              canDrop={courses.length > 1}
            />
          ))}
        </ul>
      ) : (
        <div className="clay-card flex flex-col items-center p-8 text-center sm:p-12">
          <span className="bg-brand-fixed text-brand mb-4 flex size-14 items-center justify-center rounded-full">
            <BookOpen className="size-7" aria-hidden="true" />
          </span>

          <h2 className="font-heading text-headline-md">No courses yet</h2>
          <p className="text-on-surface-variant mt-2 max-w-md text-body-md text-pretty">
            Every match is anchored to a course you share, so this is the place to
            start.
          </p>

          <Link
            href="/onboarding/courses"
            className="clay-btn-primary mt-6 rounded-full px-6 py-3 text-label-md"
          >
            Pick your courses
          </Link>
        </div>
      )}
    </>
  );
}
