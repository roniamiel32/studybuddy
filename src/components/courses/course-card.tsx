/**
 * File:        src/components/courses/course-card.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: One course in the grid, in the shape Moodle uses: a coloured
 *              banner, the code and title, and the facts you scan for.
 *
 *              The banner colour is DERIVED FROM THE COURSE CODE rather than
 *              stored. A course list is scanned, not read, and colour is what
 *              makes "the blue one" findable — but a colour column would be one
 *              more thing to seed, migrate and keep unique. Hashing the code gives
 *              a stable colour per course for free, and it is the same colour on
 *              every student's screen.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

import Link from 'next/link';
import { ChevronRight, SlidersHorizontal, TriangleAlert, Users } from 'lucide-react';

import { Chip } from '@/components/ui/chip';
import { hasOverride, type EnrolledCourseView } from '@/features/courses/course-view';
import { DropCourseButton } from '@/components/courses/drop-course-button';
import { cn } from '@/lib/utils';

/**
 * Palette for the card banners, drawn from the existing theme tokens.
 *
 * Six, because more than that stops being distinguishable at a glance and starts
 * being decoration.
 */
const BANNERS = [
  'from-brand to-brand-bright',
  'from-grape to-grape-bright',
  'from-sunset to-sunset-deep',
  'from-[#297a35] to-[#3f9c4d]',
  'from-[#296b7a] to-[#3f8b9c]',
  'from-[#7a2952] to-[#9c3f6b]',
] as const;

/**
 * Picks a stable banner for a course code.
 *
 * @param code - The course code, e.g. "CS-3040".
 * @returns One of the banner gradients, the same one every time for a given code.
 */
export function bannerFor(code: string): string {
  let hash = 0;

  for (const character of code) {
    /* Plain sum, not a cryptographic hash: it only has to be stable and spread
       six ways, and a readable one-liner beats a clever one here. */
    hash = (hash + character.charCodeAt(0)) % 997;
  }

  return BANNERS[hash % BANNERS.length];
}

export interface CourseCardProps {
  course: EnrolledCourseView;
  /** False when this is the student's only course, which cannot be dropped. */
  canDrop: boolean;
}

/**
 * Renders one course card.
 *
 * @param course  - The enrolled course.
 * @param canDrop - Whether the drop control is offered.
 * @returns The list item element.
 */
export function CourseCard({ course, canDrop }: CourseCardProps) {
  const customised = hasOverride(course.override);

  return (
    <li className="clay-card group relative flex flex-col overflow-hidden p-0">
      {/* The banner is the Moodle cue: a block of colour you navigate by. */}
      <Link
        href={`/courses/${course.offeringId}`}
        className="focus-visible:ring-brand/35 block focus-visible:ring-4 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className={cn('block h-20 bg-gradient-to-br', bannerFor(course.code))}
        >
          <span className="flex h-full items-end p-4">
            <span className="font-heading text-[15px] font-bold tracking-wider text-white/90">
              {course.code}
            </span>
          </span>
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <Link
          href={`/courses/${course.offeringId}`}
          className="focus-visible:ring-brand/35 rounded-md focus-visible:ring-4 focus-visible:outline-none"
        >
          <h3 className="font-heading text-[17px] leading-snug text-balance">{course.name}</h3>
        </Link>

        {course.faculty ? (
          <p className="text-outline mt-0.5 text-label-sm font-normal">{course.faculty}</p>
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
            /* The same provenance warning the picker shows. A student who reaches
               this card from the grid has not necessarily seen it. */
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
