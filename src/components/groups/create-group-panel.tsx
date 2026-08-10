/**
 * File:        src/components/groups/create-group-panel.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Create study group" on a course page.
 *
 *              Collapsed to a button until pressed. A form permanently expanded
 *              above the list of existing groups would push them off the screen and
 *              push people towards making a second group instead of joining one —
 *              the opposite of what the feature is for.
 * Version:     0.15.0
 *
 * Modifications:
 *     0.15.0 - 2026-08-10 - Initial implementation (Phase 5)
 */

'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, Loader2, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createGroup } from '@/features/groups/actions';
import { MAX_PARTICIPANTS, MIN_PARTICIPANTS } from '@/features/groups/group-view';

export interface CreateGroupPanelProps {
  offeringId: string;
  courseCode: string;
}

/**
 * Renders the create-a-group control and its form.
 *
 * @param offeringId - The course the group belongs to.
 * @param courseCode - Used in the default name, so the field is never empty.
 * @returns The panel element.
 */
export function CreateGroupPanel({ offeringId, courseCode }: CreateGroupPanelProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createGroup, null);

  /* Controlled, so a rejected submit does not wipe what they typed. */
  const [name, setName] = useState(`${courseCode} study group`);
  const [description, setDescription] = useState('');
  const [size, setSize] = useState('4');

  const error = state && !state.ok ? state.error : null;

  /* Close on success; the page revalidates behind it and the group appears. */
  const [handled, setHandled] = useState<unknown>(null);
  if (state?.ok && state !== handled) {
    setHandled(state);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="clay-btn-secondary focus-visible:ring-brand/35 flex items-center gap-2 rounded-md px-4 py-2 text-label-md focus-visible:ring-4 focus-visible:outline-none"
      >
        <Plus className="size-4" aria-hidden="true" />
        Create study group
      </button>
    );
  }

  return (
    <section aria-labelledby="create-group-heading" className="clay-card w-full p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 id="create-group-heading" className="font-heading text-headline-md">
            Create a study group
          </h3>
          <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
            You will be its admin, and you decide who joins.
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

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="courseOfferingId" value={offeringId} />

        {error ? (
          <p role="alert" className="text-destructive flex items-start gap-2 text-label-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error.message}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="group-name">Group name</Label>
          <Input
            id="group-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="group-description">What is it for? (optional)</Label>
          <textarea
            id="group-description"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            maxLength={400}
            placeholder="Weekly revision before the midterm, working through past exams together."
            className="border-outline-variant/60 bg-field focus-visible:border-brand focus-visible:ring-brand/25 w-full resize-none rounded-md border px-4 py-2 text-body-md transition-colors outline-none focus-visible:bg-white focus-visible:ring-4"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="group-size">How many people, including you?</Label>
          <Input
            id="group-size"
            name="maxParticipants"
            type="number"
            inputMode="numeric"
            min={MIN_PARTICIPANTS}
            max={MAX_PARTICIPANTS}
            value={size}
            onChange={(event) => setSize(event.target.value)}
            required
            className="max-w-32"
          />
          <p className="text-outline text-label-sm font-normal">
            Between {MIN_PARTICIPANTS} and {MAX_PARTICIPANTS}. You can change it later.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Create group
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
