/**
 * File:        src/components/onboarding/basics-form.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 1 — name, study track and year of study.
 *
 *              The university is not asked for. It is already known from the
 *              email domain used at signup, and asking again would invite a
 *              student to answer differently from the address they actually
 *              hold.
 * Version:     0.6.0
 *
 * Modifications:
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 */

'use client';

import { StepForm } from '@/components/onboarding/step-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { YEAR_OPTIONS } from '@/config/onboarding';
import { saveBasics } from '@/features/onboarding/actions';
import type { TrackOption } from '@/features/onboarding/queries';

export interface BasicsFormProps {
  tracks: TrackOption[];
  universityName: string;
  defaults: {
    fullName: string | null;
    studyTrackId: string | null;
    yearOfStudy: number | null;
  };
}

/**
 * Renders the step 1 form.
 *
 * @param tracks         - Study tracks at this university.
 * @param universityName - Shown so the student can see what was derived.
 * @param defaults       - Existing values, for a returning student.
 * @returns The form element.
 */
export function BasicsForm({ tracks, universityName, defaults }: BasicsFormProps) {
  return (
    <StepForm action={saveBasics} submitLabel="Continue">
      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">Your name</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          defaultValue={defaults.fullName ?? ''}
          placeholder="Roni Amiel"
        />
        <p className="text-outline text-label-sm font-normal">
          Classmates will see this when you send or receive a request.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="studyTrackId">Study track</Label>
        <select
          id="studyTrackId"
          name="studyTrackId"
          required
          defaultValue={defaults.studyTrackId ?? ''}
          className="border-outline-variant/60 bg-field focus-visible:border-brand focus-visible:ring-brand/25 h-11 w-full rounded-md border px-4 text-body-md transition-colors outline-none focus-visible:bg-white focus-visible:ring-4"
        >
          <option value="" disabled>
            Choose your track
          </option>
          {tracks.map((track) => (
            <option key={track.id} value={track.id}>
              {track.name}
            </option>
          ))}
        </select>
        <p className="text-outline text-label-sm font-normal">
          Sets which courses we show first. You can still add courses from any
          other track.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="yearOfStudy">Year of study</Label>
        <select
          id="yearOfStudy"
          name="yearOfStudy"
          required
          defaultValue={defaults.yearOfStudy ?? ''}
          className="border-outline-variant/60 bg-field focus-visible:border-brand focus-visible:ring-brand/25 h-11 w-full rounded-md border px-4 text-body-md transition-colors outline-none focus-visible:bg-white focus-visible:ring-4"
        >
          <option value="" disabled>
            Choose your year
          </option>
          {YEAR_OPTIONS.map((year) => (
            <option key={year} value={year}>
              Year {year}
            </option>
          ))}
        </select>
        <p className="text-outline text-label-sm font-normal">
          Used for context only — it never limits which courses you can pick.
        </p>
      </div>

      <p className="bg-surface-container text-on-surface-variant rounded-md p-3 text-label-md">
        Signed in with your {universityName} address, so that is the university
        you will be matched within.
      </p>
    </StepForm>
  );
}
