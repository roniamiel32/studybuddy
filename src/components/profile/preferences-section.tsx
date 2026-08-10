/**
 * File:        src/components/profile/preferences-section.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The global study preferences on the Profile tab, and the personal
 *              details above them.
 *
 *              These are the DEFAULTS every course inherits. The copy says so,
 *              because a student who has set an override on one course needs to
 *              know that changing the global answer will not reach it — silence
 *              there would look like the save had failed.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, Check, Loader2 } from 'lucide-react';

import { ChoiceGroup } from '@/components/onboarding/choice-group';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ENVIRONMENT_OPTIONS,
  GROUP_SIZE_OPTIONS,
  LANGUAGE_OPTIONS,
  STUDY_FORMAT_OPTIONS,
  TIME_BLOCK_OPTIONS,
} from '@/config/onboarding';
import { updateGlobalPreferences, updateProfileDetails } from '@/features/profile/actions';
import type { ActionResult } from '@/lib/errors';

export interface ProfileDetailsFormProps {
  fullName: string;
  city: string | null;
  isDiscoverable: boolean;
  /** Read-only context, so a student can see what was derived from their email. */
  universityName: string;
  degreeName: string | null;
  yearOfStudy: number | null;
}

/**
 * Shows the outcome of a save, once.
 *
 * @param state - The action result.
 * @param label - What was saved, for the confirmation line.
 * @returns The status element, or null before the first submit.
 */
function SaveStatus({ state, label }: { state: ActionResult<void> | null; label: string }) {
  if (!state) {
    return null;
  }

  if (!state.ok) {
    return (
      <p role="alert" className="text-destructive flex items-start gap-2 text-label-sm">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {state.error.message}
      </p>
    );
  }

  return (
    <p role="status" className="text-brand flex items-center gap-2 text-label-sm">
      <Check className="size-4" aria-hidden="true" />
      {label}
    </p>
  );
}

/**
 * Renders the personal details section.
 *
 * @param props - Current values and the derived academic context.
 * @returns The section element.
 */
export function ProfileDetailsForm({
  fullName,
  city,
  isDiscoverable,
  universityName,
  degreeName,
  yearOfStudy,
}: ProfileDetailsFormProps) {
  const [state, formAction, pending] = useActionState(updateProfileDetails, null);

  /* Controlled, so a rejected save does not wipe what they typed. */
  const [name, setName] = useState(fullName);
  const [town, setTown] = useState(city ?? '');
  const [discoverable, setDiscoverable] = useState(isDiscoverable);

  return (
    <section aria-labelledby="details-heading" className="clay-card p-6">
      <h2 id="details-heading" className="font-heading text-headline-md">
        Your details
      </h2>
      <p className="text-on-surface-variant mt-1 mb-5 text-body-md text-pretty">
        Your city helps us rank classmates who can actually meet you.
      </p>

      <form action={formAction} className="flex flex-col gap-5" noValidate>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">Your name</Label>
            <Input
              id="fullName"
              name="fullName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              name="city"
              value={town}
              onChange={(event) => setTown(event.target.value)}
              placeholder="Tel Aviv"
              autoComplete="address-level2"
            />
          </div>
        </div>

        {/*
          * Read-only context, not fields. The university is derived from the email
          * domain (D12) and the degree decides the course catalog, so neither is
          * editable here — changing a degree would orphan the courses a student is
          * enrolled in, which is a migration, not a settings toggle.
          */}
        <dl className="bg-surface-container-low border-outline-variant/30 grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
          <div>
            <dt className="text-outline text-label-sm">University</dt>
            <dd className="text-label-md">{universityName}</dd>
          </div>
          <div>
            <dt className="text-outline text-label-sm">Degree</dt>
            <dd className="text-label-md">{degreeName ?? 'Not set'}</dd>
          </div>
          <div>
            <dt className="text-outline text-label-sm">Year</dt>
            <dd className="text-label-md">{yearOfStudy ? `Year ${yearOfStudy}` : 'Not set'}</dd>
          </div>
        </dl>

        <label className="border-outline-variant/60 flex cursor-pointer items-start gap-3 rounded-md border p-4">
          <input
            type="checkbox"
            name="isDiscoverable"
            checked={discoverable}
            onChange={(event) => setDiscoverable(event.target.checked)}
            className="accent-brand mt-0.5 size-4"
          />
          <span>
            <span className="block text-label-md">Show me to classmates</span>
            <span className="text-outline block text-label-sm font-normal">
              Turn this off and you disappear from everyone&apos;s matches. Conversations you
              have already started stay open.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Save details
          </Button>
          <SaveStatus state={state} label="Details saved." />
        </div>
      </form>
    </section>
  );
}

export interface GlobalPreferencesFormProps {
  preferredTimeBlocks: string[];
  studyEnvironments: string[];
  studyFormats: string[];
  groupSizes: string[];
  spokenLanguages: string[];
  studiesOnSaturday: boolean;
  /** How many courses carry their own override, for the note below the form. */
  overriddenCourseCount: number;
}

/**
 * Renders the global preferences form.
 *
 * @param props - Current values, plus the count of courses with an override.
 * @returns The section element.
 */
export function GlobalPreferencesForm({
  preferredTimeBlocks,
  studyEnvironments,
  studyFormats,
  groupSizes,
  spokenLanguages,
  studiesOnSaturday,
  overriddenCourseCount,
}: GlobalPreferencesFormProps) {
  const [state, formAction, pending] = useActionState(updateGlobalPreferences, null);

  return (
    <section aria-labelledby="preferences-heading" className="clay-card p-6">
      <h2 id="preferences-heading" className="font-heading text-headline-md">
        How you like to study
      </h2>
      <p className="text-on-surface-variant mt-1 mb-5 text-body-md text-pretty">
        Your defaults, used for every course. You can answer differently for a
        single course from that course&apos;s page.
      </p>

      <form action={formAction} className="flex flex-col gap-6" noValidate>
        <ChoiceGroup
          name="studyFormats"
          legend="How do you want to meet?"
          options={STUDY_FORMAT_OPTIONS}
          defaultValue={studyFormats}
        />
        <ChoiceGroup
          name="preferredTimeBlocks"
          legend="When do you prefer to study?"
          options={TIME_BLOCK_OPTIONS}
          defaultValue={preferredTimeBlocks}
        />
        <ChoiceGroup
          name="studyEnvironments"
          legend="How do you like to work?"
          options={ENVIRONMENT_OPTIONS}
          defaultValue={studyEnvironments}
        />
        <ChoiceGroup
          name="groupSizes"
          legend="How many people?"
          options={GROUP_SIZE_OPTIONS}
          defaultValue={groupSizes}
        />
        <ChoiceGroup
          name="spokenLanguages"
          legend="Which languages can you study in?"
          options={LANGUAGE_OPTIONS}
          defaultValue={spokenLanguages}
        />
        <ChoiceGroup
          name="studiesOnSaturday"
          legend="Do you study on Saturday?"
          multiple={false}
          columns={2}
          options={[
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ]}
          defaultValue={[studiesOnSaturday ? 'yes' : 'no']}
        />

        {overriddenCourseCount > 0 ? (
          /*
           * Said out loud, because the alternative is a student changing their
           * global answer and concluding the save is broken when one course does
           * not move. The override stays on purpose — they set it because that
           * course is different.
           */
          <p className="bg-sunset-fixed/60 text-sunset-deep rounded-md p-3 text-label-sm">
            {overriddenCourseCount === 1
              ? 'One of your courses has its own answers and will keep them.'
              : `${overriddenCourseCount} of your courses have their own answers and will keep them.`}{' '}
            Change those from the course page.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            Save preferences
          </Button>
          <SaveStatus state={state} label="Preferences saved. Your matches are re-ranked." />
        </div>
      </form>
    </section>
  );
}
