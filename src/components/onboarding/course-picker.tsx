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
 * Version:     0.11.0
 *
 * Modifications:
 *     0.6.0  - 2026-08-05 - Initial implementation (Phase 1c)
 *     0.10.0 - 2026-08-09 - Degree-scoped; Smart Course API; tracks removed
 *     0.11.0 - 2026-08-09 - Placeholder catalogs; Continue requires a course
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, TriangleAlert } from 'lucide-react';

import { StepForm } from '@/components/onboarding/step-form';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import type { CourseApiResponse } from '@/app/api/courses/route';
import { UNVERIFIED_SOURCES } from '@/features/courses/catalog-schema';
import { saveCourses } from '@/features/onboarding/actions';
import type { OfferingOption } from '@/features/onboarding/queries';
import { cn } from '@/lib/utils';

export interface CoursePickerProps {
  /** Already scoped to the student's degree by the page. */
  offerings: OfferingOption[];
  /** Drives the Smart Course API lookup. */
  degreeId: string | null;
  degreeName: string;
  defaultSelected: string[];
}

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

  /*
   * Ask the Smart Course API for this degree's syllabus.
   *
   * Only when the server-rendered catalog is empty. If courses already exist
   * there is nothing to fetch, and calling anyway would risk a model request
   * (and its cost) on every visit to step 2.
   */
  useEffect(() => {
    if (!degreeId || offerings.length > 0) {
      return;
    }

    const abort = new AbortController();

    void (async () => {
      /*
       * Inside the async body, not the effect body: setting state synchronously
       * while an effect runs triggers an extra render pass, which the lint rule
       * flags for good reason.
       */
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
            code: course.code,
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

  const trimmed = query.trim().toLowerCase();

  /*
   * Read off the courses themselves rather than the response, so a catalog that
   * was rendered from the database on a later visit still carries its warning.
   * Two kinds of unverified, worded differently because they are different
   * claims: a generated list is a guess at THIS university's syllabus, while a
   * placeholder list is a standard curriculum that was never about this
   * university at all.
   */
  const unverified = useMemo(
    () => catalog.filter((offering) => UNVERIFIED_SOURCES.includes(offering.source)),
    [catalog],
  );
  const hasPlaceholders = unverified.some((offering) => offering.source === 'placeholder');
  const hasGenerated = unverified.some((offering) => offering.source === 'ai_generated');

  /*
   * Search narrows the DEGREE'S courses. It deliberately does not reach other
   * degrees: showing a Law student the Computer Science catalog was the bug this
   * change fixes, and a cross-degree search would quietly reintroduce it.
   */
  const visible = useMemo(
    () =>
      catalog.filter(
        (offering) =>
          !trimmed ||
          offering.name.toLowerCase().includes(trimmed) ||
          offering.code.toLowerCase().includes(trimmed),
      ),
    [catalog, trimmed],
  );

  const toggle = (offeringId: string) => {
    setSelected((current) =>
      current.includes(offeringId)
        ? current.filter((id) => id !== offeringId)
        : [...current, offeringId],
    );
  };

  const renderCourse = (offering: OfferingOption) => {
    const isSelected = selected.includes(offering.offeringId);

    return (
      <li key={offering.offeringId}>
        <button
          type="button"
          onClick={() => toggle(offering.offeringId)}
          aria-pressed={isSelected}
          /*
           * Explicit, because the name and code sit in adjacent spans and would
           * otherwise be announced run together as "Constitutional LawLAW-102".
           */
          aria-label={`${offering.name} (${offering.code})`}
          className={cn(
            'border-outline-variant/60 flex w-full items-center gap-3 rounded-md border bg-white p-3.5 text-left transition-colors',
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

          <span className="min-w-0 flex-1">
            <span className="text-label-md block truncate">{offering.name}</span>
            <span className="text-outline block truncate text-label-sm font-normal">
              {offering.code}
            </span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <StepForm
      action={saveCourses}
      submitLabel="Continue"
      backHref="/onboarding"
      /*
       * Held closed until a course is chosen. The exception is a catalog with
       * nothing in it: the requirement is there to keep a student matchable, and
       * turning it into an unsatisfiable condition would just trap them on step 2
       * with no action available. The server action draws the same line.
       */
      submitDisabled={selected.length === 0 && catalog.length > 0}
      submitDisabledReason={
        selected.length === 0 && catalog.length > 0
          ? 'Choose a course first \u2014 we match you on the courses you share'
          : undefined
      }
    >
      {/* The selection lives in React state; these carry it to the server. */}
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
          {/*
            * Provenance, stated plainly. Neither list came from the registrar, so
            * it may not match the real syllabus — saying so is the difference
            * between a useful shortcut and the app asserting something false
            * about the institution.
            */}
          <span>
            {hasPlaceholders
              ? `This is a standard course list for ${degreeName}, not your university\u2019s own syllabus. Course names and codes may differ from the real ones.`
              : `This course list was suggested automatically and has not been verified against your university\u2019s syllabus. Check it before relying on it.`}
          </span>
        </p>
      ) : null}

      {notice && !fetching ? (
        <p className="bg-surface-container text-on-surface-variant rounded-md p-3 text-label-md">
          {notice}
        </p>
      ) : null}

      {/* The page heading already asks the question; a second copy here read as
          a stutter. This block is just the search control. */}
      <div className="flex flex-col gap-2">
        <label htmlFor="course-search" className="sr-only">
          Search all courses by name or code
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
            placeholder="Search all courses by name or code"
            className="pl-10"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Chip tone={selected.length > 0 ? 'brand' : 'neutral'}>
          {selected.length} selected
        </Chip>
        {/* The reason lives on the disabled Continue button, not here too. */}
      </div>

      {visible.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-on-surface-variant text-label-md">{degreeName}</h2>
          <ul className="flex flex-col gap-2">{visible.map(renderCourse)}</ul>
        </section>
      ) : null}

      {visible.length === 0 && !fetching ? (
        <p className="text-on-surface-variant bg-surface-container rounded-md p-4 text-body-md">
          {trimmed
            ? `No courses in ${degreeName} match \u201C${query}\u201D. Try the course code instead.`
            : `We have no course list for ${degreeName} yet. You can continue and add courses later.`}
        </p>
      ) : null}

    </StepForm>
  );
}
