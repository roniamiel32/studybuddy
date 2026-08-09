/**
 * File:        src/components/onboarding/course-picker.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 2 — choosing courses.
 *
 *              The product requirement is explicit: show EVERY course in the
 *              student's track, never filtered by year of study or by where the
 *              course sits in the curriculum. Students extend degrees and take
 *              courses out of sequence, and a picker that hides a course
 *              because "you should have taken it last year" is wrong about a
 *              real person.
 *
 *              Off-track courses stay reachable through search, which covers
 *              the whole current-term catalog rather than just the track.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

'use client';

import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';

import { StepForm } from '@/components/onboarding/step-form';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import { saveCourses } from '@/features/onboarding/actions';
import type { OfferingOption } from '@/features/onboarding/queries';
import { cn } from '@/lib/utils';

export interface CoursePickerProps {
  offerings: OfferingOption[];
  studyTrackId: string | null;
  trackName: string;
  defaultSelected: string[];
}

/**
 * Renders the course picker.
 *
 * @param offerings       - Every current-term offering at this university.
 * @param studyTrackId    - The student's track, used for the default list.
 * @param trackName       - Track name, for the section heading.
 * @param defaultSelected - Offerings already enrolled in.
 * @returns The form element.
 */
export function CoursePicker({
  offerings,
  studyTrackId,
  trackName,
  defaultSelected,
}: CoursePickerProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>(defaultSelected);

  const trimmed = query.trim().toLowerCase();

  /*
   * Filtering happens here rather than on the server: the whole current-term
   * catalog arrives in one request, so typing filters instantly instead of
   * firing a query per keystroke. A catalog of thousands would need this
   * pushed back into SQL.
   */
  const { trackCourses, otherCourses } = useMemo(() => {
    const matches = (offering: OfferingOption) =>
      !trimmed ||
      offering.name.toLowerCase().includes(trimmed) ||
      offering.code.toLowerCase().includes(trimmed);

    const visible = offerings.filter(matches);

    return {
      trackCourses: visible.filter(
        (offering) => studyTrackId && offering.trackIds.includes(studyTrackId),
      ),
      otherCourses: visible.filter(
        (offering) => !studyTrackId || !offering.trackIds.includes(studyTrackId),
      ),
    };
  }, [offerings, studyTrackId, trimmed]);

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
    <StepForm action={saveCourses} submitLabel="Continue" backHref="/onboarding">
      {/* The selection lives in React state; these carry it to the server. */}
      {selected.map((offeringId) => (
        <input key={offeringId} type="hidden" name="offeringIds" value={offeringId} />
      ))}

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
        {selected.length === 0 ? (
          <span className="text-outline text-label-sm">Pick at least one to continue</span>
        ) : null}
      </div>

      {trackCourses.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-on-surface-variant text-label-md">{trackName}</h2>
          <ul className="flex flex-col gap-2">{trackCourses.map(renderCourse)}</ul>
        </section>
      ) : null}

      {otherCourses.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-on-surface-variant text-label-md">
            {trimmed ? 'Other courses' : 'Courses from other tracks'}
          </h2>
          <ul className="flex flex-col gap-2">{otherCourses.map(renderCourse)}</ul>
        </section>
      ) : null}

      {trackCourses.length === 0 && otherCourses.length === 0 ? (
        <p className="text-on-surface-variant bg-surface-container rounded-md p-4 text-body-md">
          No courses match “{query}”. Try the course code instead.
        </p>
      ) : null}
    </StepForm>
  );
}
