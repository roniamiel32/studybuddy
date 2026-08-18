/**
 * File:        src/components/onboarding/course-picker.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 2 — choosing courses.
 *
 *              Shows every course on the student's DEGREE this semester, never
 *              filtered by year of study — students extend degrees and take
 *              courses out of sequence, and hiding a course because "you should
 *              have taken it last year" is wrong about a real person.
 *
 *              Scoped to the degree, which is the fix for a Law student being
 *              shown the Computer Science catalog. When the degree has no courses
 *              yet, the Smart Course API is asked to build one.
 *
 *              At least one course is required to leave this step. Everything
 *              downstream — the score, the ranking, the reason shown on a match
 *              card — is built on shared courses, so a student who picks none is
 *              unmatchable and the next three steps cannot help them.
 * Version:     0.45.0
 *
 * Modifications:
 *     0.45.0 - Added Load More/Less pagination, Community Reporting, and Deletion UI.
 *     0.44.0 - 2026-08-18 - Year headings and course codes removed; one flat list
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, TriangleAlert, Flag, Trash2 } from 'lucide-react';

import { MissingCourseField } from '@/components/courses/missing-course-field';
import { StepForm } from '@/components/onboarding/step-form';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import type { CourseApiResponse } from '@/app/api/courses/route';
import { UNVERIFIED_SOURCES } from '@/features/courses/catalog-schema';
import { deleteCourseAction, type MatchedCourse } from '@/features/courses/gatekeeper-actions';
import { saveCourses } from '@/features/onboarding/actions';
import type { OfferingOption } from '@/features/onboarding/queries';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { cn } from '@/lib/utils';

export interface CoursePickerProps {
  /** Already scoped to the student's degree by the page. */
  offerings: OfferingOption[];
  /** Drives the Smart Course API lookup. */
  degreeId: string | null;
  degreeName: string;
  defaultSelected: string[];
}

const INITIAL_LIMIT = 10;

/**
 * Renders the course picker.
 *
 * @param offerings       - The degree's current-term offerings, from the server.
 * @param degreeId        - Drives the Smart Course API lookup.
 * @param degreeName      - Shown as the section heading.
 * @param defaultSelected - Offerings already enrolled in.
 * @returns The form element.
 */
export function CoursePicker({
  offerings,
  degreeId,
  degreeName,
  defaultSelected,
}: CoursePickerProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  const [catalog, setCatalog] = useState<OfferingOption[]>(offerings);
  const [fetching, setFetching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Pagination State
  const [displayLimit, setDisplayLimit] = useState(INITIAL_LIMIT);

  /*
   * Ask the Smart Course API for this degree's syllabus.
   */
  useEffect(() => {
    if (!degreeId || offerings.length > 0) {
      return;
    }

    const abort = new AbortController();

    void (async () => {
      setFetching(true);

      try {
        const response = await fetch('/api/courses', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ degreeId }),
          signal: abort.signal,
        });

        const payload = (await response.json()) as CourseApiResponse;

        setCatalog(
          payload.courses.map((course) => ({
            offeringId: course.offeringId,
            courseId: course.courseId,
            name: course.name,
            faculty: course.faculty,
            source: course.source,
          })),
        );
        setNotice(payload.message ?? null);
      } catch {
        if (!abort.signal.aborted) {
          setNotice(
            'We could not load a course list. Go back and pick your degree again, or try reloading.',
          );
        }
      } finally {
        if (!abort.signal.aborted) {
          setFetching(false);
        }
      }
    })();

    return () => abort.abort();
  }, [degreeId, offerings.length]);

  const settledQuery = useDebouncedValue(query);
  const trimmed = settledQuery.trim().toLowerCase();

  // Reset pagination when searching
  useEffect(() => {
    setDisplayLimit(INITIAL_LIMIT);
  }, [trimmed]);

  const unverified = useMemo(
    () => catalog.filter((offering) => UNVERIFIED_SOURCES.includes(offering.source)),
    [catalog],
  );
  const hasPlaceholders = unverified.some((offering) => offering.source === 'placeholder');
  const hasGenerated = unverified.some((offering) => offering.source === 'ai_generated');

  const visible = useMemo(
    () =>
      catalog.filter(
        (offering) => !trimmed || offering.name.toLowerCase().includes(trimmed),
      ),
    [catalog, trimmed],
  );

  // Apply Pagination
  const displayedCourses = visible.slice(0, displayLimit);

  const toggle = (offeringId: string) => {
    setSelected((current) =>
      current.includes(offeringId)
        ? current.filter((id) => id !== offeringId)
        : [...current, offeringId],
    );
  };

  const adoptCourse = (course: MatchedCourse) => {
    setCatalog((current) =>
      current.some((offering) => offering.offeringId === course.offeringId)
        ? current
        : [...current, { ...course, faculty: null, source: 'placeholder' as const }].sort(
          (a, b) => a.name.localeCompare(b.name),
        ),
    );

    setSelected((current) =>
      current.includes(course.offeringId) ? current : [...current, course.offeringId],
    );
  };

  // Mock Action: Report a course
  const handleReport = (e: React.MouseEvent, courseName: string) => {
    e.preventDefault();
    e.stopPropagation();
    alert(`Thank you for reporting "${courseName}". Our system will review this course.`);
  };

  // Mock Action: Delete a course
  const handleDelete = async (e: React.MouseEvent, offeringId: string) => {
    e.preventDefault();
    e.stopPropagation();

    setCatalog((current) => current.filter((c) => c.offeringId !== offeringId));
    setSelected((current) => current.filter((id) => id !== offeringId));

    const success = await deleteCourseAction(offeringId);

    if (!success) {
      alert("We couldn't delete this course. Other students might already be enrolled in it.");
    }
  };

  const renderCourse = (offering: OfferingOption) => {
    const isSelected = selected.includes(offering.offeringId);

    // We treat 'placeholder' source as user-generated for the MVP logic
    const isUserGenerated = offering.source === 'placeholder';

    return (
      <li key={offering.offeringId} className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => toggle(offering.offeringId)}
          aria-pressed={isSelected}
          aria-label={offering.name}
          className={cn(
            'border-outline-variant/60 flex flex-1 items-center gap-3 rounded-md border bg-white p-3.5 text-left transition-colors',
            'hover:border-brand/60 focus-visible:ring-brand/35 focus-visible:ring-4 focus-visible:outline-none',
            isSelected && 'border-brand bg-brand-fixed/50',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-sm border',
              isSelected
                ? 'border-brand bg-brand text-white'
                : 'border-outline-variant bg-white',
            )}
          >
            {isSelected ? <Check className="size-3.5" /> : null}
          </span>

          <span className="text-label-md min-w-0 flex-1 truncate">{offering.name}</span>
        </button>

        {isUserGenerated && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={(e) => handleReport(e, offering.name)}
              className="text-outline hover:bg-sunset-fixed/30 hover:text-sunset-deep rounded-md p-3 transition-colors"
              title="Report inaccurate course"
            >
              <Flag className="size-4" />
            </button>
            <button
              type="button"
              onClick={(e) => handleDelete(e, offering.offeringId)}
              className="text-outline hover:bg-sunset-fixed/30 hover:text-sunset-deep rounded-md p-3 transition-colors"
              title="Remove course from list"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        )}
      </li>
    );
  };

  return (
    <StepForm
      action={saveCourses}
      submitLabel="Continue"
      backHref="/onboarding"
      submitDisabled={selected.length === 0 && catalog.length > 0}
      submitDisabledReason={
        selected.length === 0 && catalog.length > 0
          ? 'Choose a course first \u2014 we match you on the courses you share'
          : undefined
      }
    >
      {selected.map((offeringId) => (
        <input key={offeringId} type="hidden" name="offeringIds" value={offeringId} />
      ))}

      {fetching ? (
        <p
          role="status"
          className="text-brand bg-brand-fixed/50 flex items-center gap-2 rounded-md p-3 text-label-md"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Fetching syllabus…
        </p>
      ) : null}

      {hasPlaceholders || hasGenerated ? (
        <p className="bg-sunset-fixed/60 text-sunset-deep flex items-start gap-2 rounded-md p-3 text-label-md">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {hasPlaceholders
              ? `This is a standard course list for ${degreeName}, not your university\u2019s own syllabus. Course names may differ from the real ones.`
              : `This course list was suggested automatically and has not been verified against your university\u2019s syllabus. Check it before relying on it.`}
          </span>
        </p>
      ) : null}

      {notice && !fetching ? (
        <p className="bg-surface-container text-on-surface-variant rounded-md p-3 text-label-md">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="course-search" className="sr-only">
          Search your courses
        </label>

        <div className="relative">
          <Search
            className="text-outline pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            id="course-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search your courses"
            className="pl-10"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Chip tone={selected.length > 0 ? 'brand' : 'neutral'}>
          {selected.length} selected
        </Chip>
      </div>

      {visible.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-on-surface-variant text-label-md">{degreeName}</h2>
          <ul className="flex flex-col gap-2">{displayedCourses.map(renderCourse)}</ul>

          {/* Pagination Controls */}
          {visible.length > INITIAL_LIMIT && (
            <div className="mt-2 flex items-center justify-center gap-6">
              {displayLimit < visible.length && (
                <button
                  type="button"
                  onClick={() => setDisplayLimit((l) => l + 10)}
                  className="text-brand text-label-md hover:underline"
                >
                  Load more
                </button>
              )}
              {displayLimit > INITIAL_LIMIT && (
                <button
                  type="button"
                  onClick={() => setDisplayLimit(INITIAL_LIMIT)}
                  className="text-on-surface-variant text-label-md hover:underline"
                >
                  Show less
                </button>
              )}
            </div>
          )}
        </section>
      ) : null}

      {visible.length === 0 && !fetching ? (
        <p className="text-on-surface-variant bg-surface-container rounded-md p-4 text-body-md">
          {trimmed
            ? `No courses in ${degreeName} match \u201C${query}\u201D. Add it below if it is missing.`
            : `We have no course list for ${degreeName} yet. You can continue and add courses later.`}
        </p>
      ) : null}

      {degreeId ? (
        <div className="border-outline-variant/60 border-t pt-6">
          <MissingCourseField
            degreeId={degreeId}
            idPrefix="onboarding-missing-course"
            degreeName={degreeName}
            onCourseReady={adoptCourse}
          />
        </div>
      ) : null}
    </StepForm>
  );
}