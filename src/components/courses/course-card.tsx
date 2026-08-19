/**
 * File:        src/components/courses/course-card.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: One course in the grid, in the shape Moodle uses: a coloured
 *              banner, the code and title, and the facts you scan for.
 * Version:     0.48.0
 *
 * Modifications:
 *     0.48.0 - 2026-08-19 - The banner shows initials, not a course number
 *     0.14.1 - 2026-08-10 - Added full dark mode text and surface adaptation
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

import Link from 'next/link';
import { ChevronRight, SlidersHorizontal, TriangleAlert, Users } from 'lucide-react';

import { Chip } from '@/components/ui/chip';
import {
  courseInitials,
  hasOverride,
  type EnrolledCourseView,
} from '@/features/courses/course-view';
import { DropCourseButton } from '@/components/courses/drop-course-button';

export interface CourseCardProps {
  course: EnrolledCourseView;
  canDrop: boolean;
}

export function CourseCard({ course, canDrop }: CourseCardProps) {
  const customised = hasOverride(course.override);

  return (
    <li className="clay-card group relative flex flex-col overflow-hidden p-0 border border-border/40 bg-card text-card-foreground transition-colors">
      {/* The banner is the Moodle cue: a block of colour you navigate by. */}
      <Link
        href={`/courses/${course.offeringId}`}
        className="focus-visible:ring-brand/35 block focus-visible:ring-4 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className="block h-20 bg-gradient-to-br from-[#635BFF] to-[#AF52DE]"
        >
          <span className="flex h-full items-end p-4">
            {/* Initials, where the catalogue number used to be. The name is the
                heading directly below, so repeating it here would say it twice. */}
            <span className="font-heading text-[15px] font-bold tracking-wider text-white/95 drop-shadow-sm">
            </span>
          </span>
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-4 bg-card">
        <Link
          href={`/courses/${course.offeringId}`}
          className="focus-visible:ring-brand/35 rounded-md focus-visible:ring-4 focus-visible:outline-none"
        >
          <h3 className="font-heading text-[17px] leading-snug text-balance text-card-foreground">{course.name}</h3>
        </Link>

        {course.faculty ? (
          <p className="text-muted-foreground mt-0.5 text-label-sm font-normal">{course.faculty}</p>
        ) : null}

        <div className="mt-3 mb-4 flex flex-wrap items-center gap-2">
          <Chip tone="neutral" icon="👥">
            {course.classmateCount === 0
              ? 'No classmates yet'
              : `${course.classmateCount} ${course.classmateCount === 1 ? 'classmate' : 'classmates'}`}
          </Chip>

          {customised ? (
            <Chip tone="sunset">
              <SlidersHorizontal className="size-3" aria-hidden="true" />
              Custom here
            </Chip>
          ) : null}

          {course.source === 'placeholder' || course.source === 'ai_generated' ? (
            <Chip tone="neutral">
              <TriangleAlert className="size-3" aria-hidden="true" />
              Unverified
            </Chip>
          ) : null}
        </div>

        <div className="mt-auto flex items-center gap-2">
          <Link
            href={`/courses/${course.offeringId}`}
            className="clay-btn-secondary focus-visible:ring-brand/35 flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-label-sm focus-visible:ring-4 focus-visible:outline-none"
          >
            <Users className="size-4" aria-hidden="true" />
            Find partners
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>

          {canDrop ? (
            <DropCourseButton offeringId={course.offeringId} courseName={course.name} />
          ) : null}
        </div>
      </div>
    </li>
  );
}