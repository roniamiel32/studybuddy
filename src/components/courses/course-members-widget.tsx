/**
 * File:        src/components/courses/course-members-widget.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Study members" — who else is taking this course.
 *
 *              THE PROFILE'S STUDY CONNECTIONS WIDGET, WEARING A CLASS LIST. The
 *              same card, the same row, the same avatar-and-two-lines shape, so
 *              the left column of a course reads as the left column of a person.
 *              What differs is the count: a profile has a handful of connections
 *              and a first-year lecture has four hundred students, which is why
 *              this one pages and that one does not.
 *
 *              "LOAD MORE" RATHER THAN AN INFINITE SCROLL, because this widget
 *              sits beside a feed that is itself scrollable — two things loading
 *              on scroll in one viewport fight each other, and the one you did
 *              not mean to extend is always the one that moves.
 * Version:     0.25.0
 *
 * Modifications:
 *     0.25.0 - 2026-08-13 - Initial implementation (Phase 9C)
 */

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertCircle, Loader2, Users } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { Chip } from '@/components/ui/chip';
import { loadMoreCourseMembers } from '@/features/course-wall/member-actions';
import { memberSubtitle, type CourseMemberView } from '@/features/course-wall/course-wall-view';

export interface CourseMembersWidgetProps {
  offeringId: string;
  courseCode: string;
  /** The first page, rendered on the server. */
  initialMembers: CourseMemberView[];
  initialHasMore: boolean;
  /** Everyone taking it, the viewer included — the number on the heading. */
  classmateCount: number;
}

/** How many more arrive per press. Matches the server's first page. */
const PAGE_SIZE = 6;

/**
 * Renders the study-members widget.
 *
 * @param props - The course, and its first page of members.
 * @returns The section element.
 */
export function CourseMembersWidget({
  offeringId,
  courseCode,
  initialMembers,
  initialHasMore,
  classmateCount,
}: CourseMembersWidgetProps) {
  const [members, setMembers] = useState(initialMembers);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section aria-labelledby="members-heading" className="clay-card p-5">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 id="members-heading" className="font-heading text-headline-md">
          Study members
        </h2>
        {classmateCount > 0 ? <Chip tone="mint">{classmateCount}</Chip> : null}
      </div>

      <p className="text-on-surface-variant mt-1 mb-4 text-body-md text-pretty">
        Classmates taking {courseCode} with you.
      </p>

      {members.length > 0 ? (
        <>
          <ul aria-label="Study members" className="flex flex-col gap-2">
            {members.map((member) => (
              <li key={member.id}>
                <Link
                  href={`/students/${member.id}`}
                  className="border-outline-variant/60 hover:border-brand/60 focus-visible:ring-brand/35 flex items-center gap-3 rounded-md border bg-white p-3 transition-colors focus-visible:ring-4 focus-visible:outline-none"
                >
                  <MatchAvatar
                    fullName={member.fullName}
                    avatarUrl={member.avatarUrl}
                    size={36}
                    className="border-2"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-label-md block truncate">{member.fullName}</span>
                    <span className="text-outline block truncate text-label-sm font-normal">
                      {memberSubtitle(member) || 'Taking this course'}
                    </span>
                  </span>
                  <Users className="text-brand size-4 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>

          {error ? (
            <p role="alert" className="text-destructive mt-3 flex items-start gap-2 text-label-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          {hasMore ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await loadMoreCourseMembers({
                    offeringId,
                    offset: members.length,
                    limit: PAGE_SIZE,
                  });

                  if (result.ok) {
                    /* Appended by id rather than replaced, so a classmate who
                       enrolled between two presses cannot appear twice. */
                    setMembers((current) => {
                      const seen = new Set(current.map((member) => member.id));
                      return [
                        ...current,
                        ...result.data.members.filter((member) => !seen.has(member.id)),
                      ];
                    });
                    setHasMore(result.data.hasMore);
                  } else {
                    setError(result.error.message);
                  }
                });
              }}
              className="clay-btn-secondary focus-visible:ring-brand/35 mt-3 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-label-md focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Load more
            </button>
          ) : null}
        </>
      ) : (
        <p className="text-on-surface-variant bg-surface-container rounded-md p-4 text-body-md text-pretty">
          Nobody else has joined {courseCode} yet. You are early.
        </p>
      )}
    </section>
  );
}
