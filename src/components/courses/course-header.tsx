/**
 * File:        src/components/courses/course-header.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: A course, wearing the same header a student wears.
 *
 *              THE POINT OF MATCHING profile-header IS NOT DECORATION. A course
 *              and a person are both things you arrive at, look over and act on,
 *              and giving them the same banner, the same title block and the same
 *              actions area means a student learns the shape once. Where the
 *              profile puts an avatar this puts the course code in the same
 *              circle, because a course has no face and an empty ring would read
 *              as a missing photo.
 *
 *              IT OWNS THE NAVIGATION BETWEEN THE TWO VIEWS, exactly as the
 *              profile header does: "Course Tips" leads out, the title leads
 *              back, and usePathname decides which — so a page cannot forget to
 *              say where it is and end up offering a link to itself.
 * Version:     0.25.0
 *
 * Modifications:
 *     0.25.0 - 2026-08-13 - Initial implementation (Phase 9C)
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, BookOpen, GraduationCap, Lightbulb, Users } from 'lucide-react';

import { CoursePreferencesDialog } from '@/components/courses/course-preferences-dialog';
import { Chip } from '@/components/ui/chip';
import type {
  CoursePreferenceOverride,
  CoursePreferenceValues,
} from '@/features/courses/course-view';

export interface CourseHeaderProps {
  offeringId: string;
  name: string;
  code: string;
  faculty: string | null;
  classmateCount: number;
  globals: CoursePreferenceValues;
  override: CoursePreferenceOverride;
}

/**
 * Renders the course header.
 *
 * @param props - The course, and the preferences the dialog needs.
 * @returns The header section.
 */
export function CourseHeader({
  offeringId,
  name,
  code,
  faculty,
  classmateCount,
  globals,
  override,
}: CourseHeaderProps) {
  const pathname = usePathname();
  const courseHref = `/courses/${offeringId}`;
  const onTips = pathname?.endsWith('/tips') ?? false;

  return (
    <section aria-labelledby="course-heading" className="clay-card mb-6 overflow-hidden p-0">
      <div
        aria-hidden="true"
        className="h-24 bg-[linear-gradient(135deg,var(--color-grape-bright)_0%,var(--color-brand-bright)_55%,var(--color-brand)_100%)]"
      />

      <div className="p-6">
        {/* The code badge overlaps the banner, where a profile puts its avatar. */}
        <div className="-mt-16 mb-4 flex flex-wrap items-end justify-between gap-4">
          {onTips ? (
            <Link
              href={courseHref}
              aria-label={`Back to ${code}`}
              className="focus-visible:ring-brand/35 rounded-2xl focus-visible:ring-4 focus-visible:outline-none"
            >
              <CourseBadge code={code} />
            </Link>
          ) : (
            <CourseBadge code={code} />
          )}

          <div className="flex flex-wrap items-center gap-2">
            {onTips ? null : (
              <Link
                href={`${courseHref}/tips`}
                className="clay-btn-primary focus-visible:ring-brand/35 flex items-center gap-2 rounded-md px-4 py-2 text-label-md focus-visible:ring-4 focus-visible:outline-none"
              >
                <Lightbulb className="size-4" aria-hidden="true" />
                Course Tips
              </Link>
            )}

            {/*
              The SAME dialog the sidebar opens, with a different button — see
              CoursePreferencesDialogProps. Recreating it here would mean two
              copies of the "identical to global means store NULL" rule.
            */}
            <CoursePreferencesDialog
              offeringId={offeringId}
              courseCode={code}
              globals={globals}
              override={override}
              triggerLabel="Preferences"
              triggerClassName="clay-btn-secondary focus-visible:ring-brand/35 flex items-center gap-2 rounded-md px-4 py-2 text-label-md focus-visible:ring-4 focus-visible:outline-none"
              showStatusNote={false}
            />
          </div>
        </div>

        {onTips ? (
          <Link
            href={courseHref}
            className="text-on-surface-variant hover:text-brand focus-visible:ring-brand/35 mb-2 inline-flex items-center gap-1.5 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back to the course
          </Link>
        ) : null}

        {/* Plain text on the course page itself: a link to the page you are on
            is a dead control. */}
        <h1 id="course-heading" className="font-heading text-[28px] leading-9 text-balance">
          {onTips ? (
            <Link
              href={courseHref}
              className="hover:text-brand focus-visible:ring-brand/35 rounded-md transition-colors focus-visible:ring-4 focus-visible:outline-none"
            >
              {name}
            </Link>
          ) : (
            name
          )}
        </h1>

        <p className="text-on-surface-variant mt-1 text-body-md">
          {[code, faculty].filter(Boolean).join(' · ')}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip tone="brand">
            <BookOpen className="size-3" aria-hidden="true" />
            {code}
          </Chip>
          {faculty ? (
            <Chip tone="neutral">
              <GraduationCap className="size-3" aria-hidden="true" />
              {faculty}
            </Chip>
          ) : null}
          {classmateCount > 0 ? (
            <Chip tone="mint">
              <Users className="size-3" aria-hidden="true" />
              {classmateCount} {classmateCount === 1 ? 'classmate' : 'classmates'}
            </Chip>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * The course code in the circle a profile puts its photo in.
 *
 * @param code - The course code.
 * @returns The badge element.
 */
function CourseBadge({ code }: { code: string }) {
  return (
    <span className="border-surface bg-brand-fixed text-brand flex size-24 items-center justify-center rounded-2xl border-4 text-center font-heading text-headline-md">
      {code}
    </span>
  );
}
