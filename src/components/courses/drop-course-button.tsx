/**
 * File:        src/components/courses/drop-course-button.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Removes a course from the student's list.
 *
 *              Two presses, not one. Dropping a course deletes the enrolment and
 *              cascades away the per-course preferences with it, and the control
 *              sits next to a link — a mis-tap should not silently undo work. The
 *              confirmation is inline rather than a dialog: it is a small,
 *              reversible-by-re-adding action, and a modal for it would be heavier
 *              than the decision.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, Check, Loader2, Trash2, X } from 'lucide-react';

import { dropCourse } from '@/features/courses/actions';

export interface DropCourseButtonProps {
  offeringId: string;
  /** Named in the accessible label, since a grid holds several of these. */
  courseName: string;
}

/**
 * Renders the drop control.
 *
 * @param offeringId - The enrolment to remove.
 * @param courseName - Used in the accessible label and the confirmation.
 * @returns The control element.
 */
export function DropCourseButton({ offeringId, courseName }: DropCourseButtonProps) {
  const [state, formAction, pending] = useActionState(dropCourse, null);
  const [confirming, setConfirming] = useState(false);

  const error = state && !state.ok ? state.error : null;

  if (error) {
    /*
     * The likely error is the last-course rule, which is a real answer rather
     * than a failure — so it replaces the control instead of sitting under it.
     */
    return (
      <p role="alert" className="text-destructive flex items-start gap-1.5 text-label-sm">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {error.message}
      </p>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Drop ${courseName}`}
        className="text-outline hover:text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/35 rounded-md p-2 transition-colors focus-visible:ring-4 focus-visible:outline-none"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="offeringId" value={offeringId} />

      <span className="text-outline mr-1 text-label-sm font-normal">Drop?</span>

      <button
        type="submit"
        disabled={pending}
        aria-label={`Confirm dropping ${courseName}`}
        className="text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/35 rounded-md p-2 transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Check className="size-4" aria-hidden="true" />
        )}
      </button>

      <button
        type="button"
        onClick={() => setConfirming(false)}
        aria-label="Keep this course"
        className="text-outline hover:bg-surface-container-high focus-visible:ring-brand/35 rounded-md p-2 transition-colors focus-visible:ring-4 focus-visible:outline-none"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </form>
  );
}
