/**
 * File:        src/components/courses/course-preferences-dialog.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Edit preferences for this course" — the override questionnaire.
 *
 *              A native <dialog>, so focus trapping, Escape and the backdrop come
 *              from the platform rather than from three effects and a keydown
 *              handler. The form inside is the same ChoiceGroup used by onboarding
 *              and the Profile tab, so the same question never looks like two
 *              different questions.
 *
 *              THE COPY DOES THE HARD PART. Every question shows what the global
 *              answer is, and saving something identical to it stores NULL rather
 *              than a copy — otherwise a later change to the global preference
 *              would silently skip this course and the student would have no way
 *              to know why.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, RotateCcw, SlidersHorizontal, X } from 'lucide-react';

import { ChoiceGroup } from '@/components/onboarding/choice-group';
import { Button } from '@/components/ui/button';
import {
  ENVIRONMENT_OPTIONS,
  GROUP_SIZE_OPTIONS,
  STUDY_FORMAT_OPTIONS,
  TIME_BLOCK_OPTIONS,
} from '@/config/onboarding';
import { clearCoursePreferences, saveCoursePreferences } from '@/features/courses/actions';
import {
  hasOverride,
  resolveCoursePreferences,
  type CoursePreferenceOverride,
  type CoursePreferenceValues,
} from '@/features/courses/course-view';

export interface CoursePreferencesDialogProps {
  offeringId: string;
  courseCode: string;
  globals: CoursePreferenceValues;
  override: CoursePreferenceOverride;
}

/**
 * Renders the override control and its dialog.
 *
 * @param offeringId - The course being edited.
 * @param courseCode - Shown in the dialog title.
 * @param globals    - The student's global answers, shown as the baseline.
 * @param override   - The stored override, nulls meaning inherit.
 * @returns The button and dialog elements.
 */
export function CoursePreferencesDialog({
  offeringId,
  courseCode,
  globals,
  override,
}: CoursePreferencesDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [saveState, saveAction, saving] = useActionState(saveCoursePreferences, null);
  const [clearState, clearAction, clearing] = useActionState(clearCoursePreferences, null);

  const customised = hasOverride(override);
  const inForce = resolveCoursePreferences(globals, override);
  const error =
    saveState && !saveState.ok
      ? saveState.error
      : clearState && !clearState.ok
        ? clearState.error
        : null;

  /* showModal() is the only way to get the platform's focus trap and backdrop;
     it cannot be expressed as a prop, so the element is driven imperatively. */
  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  /* Close once a save or reset succeeds — the page revalidates behind it. */
  const succeeded = saveState?.ok === true || clearState?.ok === true;
  const [handled, setHandled] = useState<unknown>(null);
  const latest = saveState?.ok ? saveState : clearState?.ok ? clearState : null;

  if (succeeded && latest !== handled) {
    setHandled(latest);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="clay-btn-secondary focus-visible:ring-brand/35 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-label-md focus-visible:ring-4 focus-visible:outline-none"
      >
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        Edit preferences for this course
      </button>

      {customised ? (
        <p className="text-sunset-deep mt-2 text-label-sm font-normal">
          This course uses its own answers, not your defaults.
        </p>
      ) : (
        <p className="text-outline mt-2 text-label-sm font-normal">
          Currently using your global preferences.
        </p>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="course-prefs-title"
        className="bg-surface m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl p-0 shadow-clay-lifted backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <div className="border-outline-variant/30 flex items-start justify-between gap-4 border-b p-5">
          <div>
            <h2 id="course-prefs-title" className="font-heading text-headline-md">
              Preferences for {courseCode}
            </h2>
            <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
              These apply to this course only. Everything else keeps your defaults.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-outline hover:bg-surface-container-high focus-visible:ring-brand/35 shrink-0 rounded-full p-2 transition-colors focus-visible:ring-4 focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <form action={saveAction} className="flex max-h-[70vh] flex-col gap-6 overflow-y-auto p-5">
          <input type="hidden" name="offeringId" value={offeringId} />

          {error ? (
            <p role="alert" className="text-destructive flex items-start gap-2 text-label-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error.message}
            </p>
          ) : null}

          {/*
            * Each question names the global answer underneath it. Without that, a
            * student cannot tell whether they are about to change something or
            * merely restate it.
            */}
          <ChoiceGroup
            name="studyFormats"
            legend="How do you want to meet for this course?"
            options={STUDY_FORMAT_OPTIONS}
            defaultValue={inForce.studyFormats}
          />
          <ChoiceGroup
            name="preferredTimeBlocks"
            legend="When would you study for it?"
            options={TIME_BLOCK_OPTIONS}
            defaultValue={inForce.preferredTimeBlocks}
          />
          <ChoiceGroup
            name="studyEnvironments"
            legend="How would you work on it?"
            options={ENVIRONMENT_OPTIONS}
            defaultValue={inForce.studyEnvironments}
          />
          <ChoiceGroup
            name="groupSizes"
            legend="How many people, for this one?"
            options={GROUP_SIZE_OPTIONS}
            defaultValue={inForce.groupSizes}
          />

          <div className="border-outline-variant/30 flex flex-wrap items-center gap-3 border-t pt-4">
            <Button type="submit" disabled={saving || clearing}>
              {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Save for this course
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={saving || clearing}
            >
              Cancel
            </Button>
          </div>
        </form>

        {customised ? (
          /*
           * A separate form, because it is a separate action — nesting it inside
           * the save form would submit the questionnaire instead.
           */
          <form action={clearAction} className="border-outline-variant/30 border-t p-5">
            <input type="hidden" name="offeringId" value={offeringId} />
            <button
              type="submit"
              disabled={saving || clearing}
              className="text-on-surface-variant hover:text-brand focus-visible:ring-brand/35 flex items-center gap-2 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
            >
              {clearing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="size-4" aria-hidden="true" />
              )}
              Go back to my global preferences
            </button>
          </form>
        ) : null}
      </dialog>
    </>
  );
}
