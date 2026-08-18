/**
 * File:        src/components/courses/missing-course-field.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Missing a course? Add it here" — one component, used from
 *              onboarding step 2 and from the Courses tab's add-a-course panel.
 *
 *              Shared rather than duplicated because the two copies would drift:
 *              the gatekeeper's rules about what counts as a course are the
 *              product's rules, and a student should not get a different answer
 *              depending on which screen they were on when they asked.
 *
 *              NO <form> ELEMENT. Both call sites already sit inside one, and a
 *              nested form is invalid HTML — browsers drop the inner one, so the
 *              button meant to check a course name submits the whole step
 *              instead. The action is called directly from a transition, and
 *              Enter is handled by hand for the same reason.
 * Version:     0.44.0
 *
 * Modifications:
 *     0.43.0 - 2026-08-17 - Initial implementation, replacing the onboarding-only
 *                           schedule import panel
 *     0.44.0 - 2026-08-18 - Placeholder names the student's own degree
 */

'use client';

import { useState, useTransition } from 'react';
import { Loader2, Plus, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import {
  checkMissingCourse,
  type MatchedCourse,
} from '@/features/courses/gatekeeper-actions';

export interface MissingCourseFieldProps {
  /** The student's degree. The action loads its catalog itself. */
  degreeId: string;
  /** Named in the placeholder, so the example reads as the student's own subject. */
  degreeName: string;
  /**
   * Called with the whole course once one is matched or created. What that means
   * differs by screen — tick it in the picker, or enrol immediately — so the
   * caller decides. The whole course rather than its id, because a newly created
   * one is in no list the caller already holds.
   */
  onCourseReady: (course: MatchedCourse) => void;
  /** Distinguishes the input when both call sites render on one page. */
  idPrefix?: string;
}

/**
 * Renders the missing-course input.
 *
 * @param degreeId      - Drives the catalog the name is checked against.
 * @param degreeName    - Named in the placeholder.
 * @param onCourseReady - Receives the matched or created course.
 * @param idPrefix      - Namespaces the input id and its label.
 * @returns The field element.
 */
export function MissingCourseField({
  degreeId,
  degreeName,
  onCourseReady,
  idPrefix = 'missing-course',
}: MissingCourseFieldProps) {
  const [value, setValue] = useState('');
  const [pending, startTransition] = useTransition();
  const notify = useToast();

  const submit = () => {
    const courseName = value.trim();

    if (courseName.length < 2 || pending) {
      return;
    }

    startTransition(async () => {
      const result = await checkMissingCourse({ degreeId, courseName });

      if (!result.ok) {
        notify({ tone: 'error', message: result.error.message });
        return;
      }

      const verdict = result.data;

      /*
       * The agent's own sentence, verbatim. It was asked for one the student can
       * read, and rewording it here would mean maintaining two explanations of
       * the same decision.
       */
      notify({
        tone: verdict.isValid ? 'success' : 'error',
        message: verdict.message,
      });

      if (verdict.isValid && verdict.course) {
        onCourseReady(verdict.course);
        setValue('');
      }
    });
  };

  const inputId = `${idPrefix}-input`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-label-md">
        Missing a course? Add it here
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={inputId}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            /*
             * Enter would otherwise submit the surrounding form — Continue on
             * onboarding, or a join on the Courses tab.
             */
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
          disabled={pending}
          placeholder={`e.g. Introduction to ${degreeName}`}
          aria-describedby={`${idPrefix}-hint`}
          className="min-w-56 flex-1"
        />

        <Button
          type="button"
          variant="outline"
          disabled={pending || value.trim().length < 2}
          onClick={submit}
        >
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          {pending ? 'Checking…' : 'Check it'}
        </Button>
      </div>

      <p
        id={`${idPrefix}-hint`}
        className="text-outline flex items-start gap-1.5 text-label-sm"
      >
        <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Matched against your degree’s course list. Nobody checks a new course
        against the syllabus, so type its full name.
      </p>
    </div>
  );
}
