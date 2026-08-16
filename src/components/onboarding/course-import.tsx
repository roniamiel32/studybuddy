/**
 * File:        src/components/onboarding/course-import.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 2's shortcut — upload a photo or PDF of the semester
 *              timetable and let the agent read the courses off it, or type one
 *              the catalog is missing.
 *
 *              HUMAN IN THE LOOP, LITERALLY. Nothing the agent returns is
 *              selected on the student's behalf. Every match is a proposal with
 *              an Add button and the agent's own one-line reason next to it, and
 *              the list carries a standing notice that a machine wrote it. The
 *              agent misreading a blurry photo should cost a student one glance,
 *              not a semester of being matched on courses they are not taking.
 *
 *              NO <form> IN HERE. This renders inside StepForm's form, and a
 *              nested form is invalid HTML — browsers drop the inner one, and
 *              the button that was meant to scan a schedule submits the whole
 *              onboarding step instead. The action is called directly from a
 *              transition, which is also what keeps the file out of the step's
 *              own submission.
 * Version:     0.42.0
 *
 * Modifications:
 *     0.42.0 - 2026-08-16 - Initial implementation (schedule import)
 */

'use client';

import { useRef, useState, useTransition } from 'react';
import { AlertCircle, Check, Info, Loader2, Plus, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import {
  ACCEPTED_MEDIA_TYPES,
  type CourseReview,
  type ReviewedCourse,
} from '@/features/courses/extract-schema';
import { reviewCourseInput } from '@/features/courses/import-actions';
import { cn } from '@/lib/utils';

export interface CourseImportProps {
  /** The student's degree. The action loads its catalog itself. */
  degreeId: string;
  /** Offerings already ticked in the picker, so an added course reads as added. */
  selected: string[];
  /** Adds offerings to the picker's selection. */
  onAdd: (offeringIds: string[]) => void;
}

type Busy = 'file' | 'text' | null;

/**
 * Renders the schedule import panel.
 *
 * @param degreeId - Drives the catalog the agent is compared against.
 * @param selected - The picker's current selection.
 * @param onAdd    - Adds offerings to that selection.
 * @returns The panel element.
 */
export function CourseImport({ degreeId, selected, onAdd }: CourseImportProps) {
  const [review, setReview] = useState<CourseReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * Sends one review request.
   *
   * @param formData - Already carries the degree and exactly one input.
   * @param kind     - Which control is waiting, so only that one shows a spinner.
   * @returns Nothing.
   */
  const run = (formData: FormData, kind: Exclude<Busy, null>) => {
    setBusy(kind);
    setError(null);

    startTransition(async () => {
      const result = await reviewCourseInput(null, formData);
      setBusy(null);

      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      setReview(result.data);
    });
  };

  const onFileChosen = (file: File | undefined) => {
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.set('degreeId', degreeId);
    formData.set('schedule', file);
    run(formData, 'file');

    /* Cleared so choosing the same file twice fires change again. */
    if (fileInput.current) {
      fileInput.current.value = '';
    }
  };

  const onTypedSubmit = () => {
    if (typed.trim().length < 2 || busy) {
      return;
    }

    const formData = new FormData();
    formData.set('degreeId', degreeId);
    formData.set('courseName', typed);
    run(formData, 'text');
  };

  /* Only a course that exists and is offered this term can actually be ticked. */
  const addable = (review?.courses ?? []).filter(
    (course): course is ReviewedCourse & { offeringId: string } =>
      course.isValid && course.isDuplicate && course.offeringId !== null,
  );
  const unadded = addable.filter((course) => !selected.includes(course.offeringId));

  return (
    <section className="border-outline-variant/60 flex flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-label-md">Have your timetable to hand?</h2>
        <p className="text-on-surface-variant text-body-md text-pretty">
          Upload a photo or PDF of your semester schedule and we will pick the courses
          out of it. You choose what gets added.
        </p>
      </div>

      <div>
        <label htmlFor="schedule" className="sr-only">
          Upload your semester schedule
        </label>
        <input
          ref={fileInput}
          id="schedule"
          type="file"
          accept={ACCEPTED_MEDIA_TYPES.join(',')}
          className="sr-only"
          onChange={(event) => onFileChosen(event.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null}
          onClick={() => fileInput.current?.click()}
        >
          {busy === 'file' ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Upload aria-hidden="true" />
          )}
          {busy === 'file' ? 'Reading your schedule…' : 'Upload my schedule'}
        </Button>
      </div>

      {busy === 'file' ? (
        <p role="status" className="text-outline text-label-sm">
          This takes a few seconds — a timetable is a lot to read.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="text-destructive bg-destructive/10 flex items-start gap-2 rounded-md p-3 text-label-md"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {review ? (
        <div className="flex flex-col gap-3">
          {/*
            * The disclaimer sits above the list and stays there — it is a
            * property of the list, not a dismissible notice about how it
            * arrived. Only shown when a model actually produced it; the
            * deterministic fallback says something else below.
            */}
          {review.generatedByAi ? (
            <p className="bg-surface-container text-on-surface-variant flex items-start gap-2 rounded-md p-3 text-label-md">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              This course list was generated automatically by an AI agent. Check it
              before adding anything.
            </p>
          ) : null}

          {review.courses.length === 0 ? (
            <p className="text-on-surface-variant text-body-md">
              We could not find any courses in that file. Try a clearer photo, or search
              the list below.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {review.courses.map((course, index) => (
                <CourseRow
                  key={`${course.courseName}-${index}`}
                  course={course}
                  isSelected={
                    course.offeringId !== null && selected.includes(course.offeringId)
                  }
                  onAdd={onAdd}
                />
              ))}
            </ul>
          )}

          {unadded.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={() => onAdd(unadded.map((course) => course.offeringId))}
            >
              <Plus aria-hidden="true" />
              Add all {unadded.length} matched courses
            </Button>
          ) : null}
        </div>
      ) : null}

      {/*
        * The feedback path. A student who cannot find their course is the one
        * person who knows the catalog is wrong, and this is where they say so —
        * it runs the same review, just with a name instead of a file.
        */}
      <div className="border-outline-variant/60 flex flex-col gap-2 border-t pt-4">
        <label htmlFor="missing-course" className="text-label-md">
          Missing a course? Add it here
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="missing-course"
            /*
             * Not type="search" and not inside a form: Enter inside StepForm's
             * form would otherwise submit the whole onboarding step.
             */
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onTypedSubmit();
              }
            }}
            placeholder="e.g. Introduction to Computer Science"
            className="min-w-56 flex-1"
          />

          <Button
            type="button"
            variant="outline"
            disabled={busy !== null || typed.trim().length < 2}
            onClick={onTypedSubmit}
          >
            {busy === 'text' ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Plus aria-hidden="true" />
            )}
            Check it
          </Button>
        </div>
      </div>
    </section>
  );
}

/**
 * Renders one reviewed course.
 *
 * The agent's reason is shown next to every verdict, including the ones it got
 * right. A student who can see why a line was called a lunch break can tell at a
 * glance when it was not one.
 *
 * @param course     - The reviewed entry.
 * @param isSelected - Whether the picker already has it ticked.
 * @param onAdd      - Adds it to the selection.
 * @returns The list item.
 */
function CourseRow({
  course,
  isSelected,
  onAdd,
}: {
  course: ReviewedCourse;
  isSelected: boolean;
  onAdd: (offeringIds: string[]) => void;
}) {
  const canAdd = course.isValid && course.offeringId !== null;

  return (
    <li
      className={cn(
        'border-outline-variant/60 flex items-start gap-3 rounded-md border bg-white p-3',
        !course.isValid && 'opacity-70',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="text-label-md block truncate">{course.courseName}</span>
        {course.courseNumber ? (
          <span className="text-outline block truncate text-label-sm font-normal">
            {course.courseNumber}
          </span>
        ) : null}
        <span className="text-on-surface-variant mt-1 block text-label-sm font-normal text-pretty">
          {course.reason}
        </span>
      </span>

      {!course.isValid ? (
        <Chip tone="neutral">Not a course</Chip>
      ) : canAdd ? (
        isSelected ? (
          <Chip tone="brand" icon={<Check className="size-3" />}>
            Added
          </Chip>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onAdd([course.offeringId as string])}
          >
            <Plus aria-hidden="true" />
            Add
          </Button>
        )
      ) : (
        <Chip tone="sunset">Not in the list</Chip>
      )}
    </li>
  );
}
