/**
 * File:        src/components/courses/add-course-panel.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Adding a course to the student's list from the Courses grid.
 *
 *              Collapsed by default. The grid's job is to show the courses you
 *              have; a permanently expanded picker would compete with it for the
 *              top of the screen every time you visit.
 *
 *              Offers only courses on the student's own degree that they are not
 *              already in — the same scoping the onboarding picker uses, for the
 *              same reason a Law student should never be offered CS-3040.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

'use client';

import { useActionState, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Plus, Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { joinCourse } from '@/features/courses/actions';

export interface AddCoursePanelProps {
  /** Current-term offerings on the student's degree they are not enrolled in. */
  options: Array<{ offeringId: string; code: string; name: string }>;
}

/**
 * Renders the add-a-course panel.
 *
 * @param options - Courses available to add.
 * @returns The panel element.
 */
export function AddCoursePanel({ options }: AddCoursePanelProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [state, formAction, pending] = useActionState(joinCourse, null);
  const [addingId, setAddingId] = useState<string | null>(null);

  const error = state && !state.ok ? state.error : null;
  const trimmed = query.trim().toLowerCase();

  const visible = useMemo(
    () =>
      options.filter(
        (option) =>
          !trimmed ||
          option.name.toLowerCase().includes(trimmed) ||
          option.code.toLowerCase().includes(trimmed),
      ),
    [options, trimmed],
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="clay-btn-secondary focus-visible:ring-brand/35 flex items-center gap-2 rounded-md px-4 py-2 text-label-md focus-visible:ring-4 focus-visible:outline-none"
      >
        <Plus className="size-4" aria-hidden="true" />
        Add a course
      </button>
    );
  }

  return (
    <section aria-labelledby="add-course-heading" className="clay-card w-full p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 id="add-course-heading" className="font-heading text-headline-md">
            Add a course
          </h2>
          <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
            Courses on your degree this semester.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="text-outline hover:bg-surface-container-high focus-visible:ring-brand/35 rounded-full p-2 transition-colors focus-visible:ring-4 focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      {options.length === 0 ? (
        <p className="text-on-surface-variant bg-surface-container rounded-md p-4 text-body-md">
          You are already in every course we have for your degree this semester.
        </p>
      ) : (
        <>
          <div className="relative mb-3">
            <Search
              className="text-outline pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <label htmlFor="add-course-search" className="sr-only">
              Search courses by name or code
            </label>
            <Input
              id="add-course-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or code"
              className="pl-10"
            />
          </div>

          {error ? (
            <p role="alert" className="text-destructive mb-3 flex items-start gap-2 text-label-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error.message}
            </p>
          ) : null}

          <ul
            aria-label="Courses you can add"
            className="flex max-h-80 flex-col gap-2 overflow-y-auto"
          >
            {visible.map((option) => (
              <li key={option.offeringId}>
                <form action={formAction}>
                  <input type="hidden" name="offeringId" value={option.offeringId} />
                  <button
                    type="submit"
                    onClick={() => setAddingId(option.offeringId)}
                    disabled={pending}
                    className="border-outline-variant/60 hover:border-brand/60 focus-visible:ring-brand/35 flex w-full items-center gap-3 rounded-md border bg-white p-3 text-left transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
                  >
                    {/* Only the row being submitted shows a spinner; `pending` is
                        shared by every form in this list. */}
                    {pending && addingId === option.offeringId ? (
                      <Loader2 className="text-brand size-4 shrink-0 animate-spin" aria-hidden="true" />
                    ) : (
                      <Plus className="text-brand size-4 shrink-0" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="text-label-md block truncate">{option.name}</span>
                      <span className="text-outline block truncate text-label-sm font-normal">
                        {option.code}
                      </span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>

          {visible.length === 0 ? (
            <p className="text-on-surface-variant bg-surface-container rounded-md p-4 text-body-md">
              No course matches &ldquo;{query}&rdquo;. Try the course code instead.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
