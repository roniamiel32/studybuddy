/**
 * File:        src/components/onboarding/basics-form.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Step 1 — photo, name, degree level and degree, year of study,
 *              city and date of birth.
 *
 *              The university is not asked for. It is already known from the
 *              email domain used at signup, and asking again would invite a
 *              student to answer differently from the address they actually
 *              hold.
 * Version:     0.10.0
 *
 * Modifications:
 *     0.10.0 - 2026-08-09 - Track select removed; generic name placeholder
 *     0.6.0 - 2026-08-05 - Initial implementation (Phase 1c)
 *     0.6.1 - 2026-08-05 - Controlled fields so a failed submit keeps entries;
 *                          avatar upload; name pre-filled from the address
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, UserRound } from 'lucide-react';

import { StepForm } from '@/components/onboarding/step-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DEGREE_LEVEL_OPTIONS, YEAR_OPTIONS } from '@/config/onboarding';
import { saveBasics } from '@/features/onboarding/actions';
import type { DegreeOption } from '@/features/onboarding/queries';

/** Mirrors the storage bucket's own limit, so oversize files fail here first. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export interface BasicsFormProps {
  degrees: DegreeOption[];
  universityName: string;
  /** Guessed from the email local part; used only when no name is saved yet. */
  suggestedName: string;
  defaults: {
    fullName: string | null;
    degreeId: string | null;
    yearOfStudy: number | null;
    city: string | null;
    dateOfBirth: string | null;
    avatarUrl: string | null;
  };
}

const selectClasses =
  'border-outline-variant/60 bg-field focus-visible:border-brand focus-visible:ring-brand/25 h-11 w-full rounded-md border px-4 text-body-md transition-colors outline-none focus-visible:bg-white focus-visible:ring-4';

/**
 * Renders the step 1 form.
 *
 * @param degrees        - Degrees at this university, filtered by level in the UI.
 * @param universityName - Shown so the student can see what was derived.
 * @param suggestedName  - Name guessed from the address.
 * @param defaults       - Existing values, for a returning student.
 * @returns The form element.
 */
export function BasicsForm({
  degrees,
  universityName,
  suggestedName,
  defaults,
}: BasicsFormProps) {
  /*
   * Every field here is controlled. React 19 resets an uncontrolled form once
   * its action returns — including when it returned an error — so an
   * unrecognised degree would otherwise also wipe the name the student had just
   * typed.
   */
  const [fullName, setFullName] = useState(defaults.fullName ?? suggestedName);
  const [degreeId, setDegreeId] = useState(defaults.degreeId ?? '');
  const [yearOfStudy, setYearOfStudy] = useState(
    defaults.yearOfStudy ? String(defaults.yearOfStudy) : '',
  );
  const [city, setCity] = useState(defaults.city ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(defaults.dateOfBirth ?? '');

  /*
   * Degree level is a filter, not a saved field. The level belongs to the degree
   * itself, so asking for it separately and storing it would let the two
   * disagree; here it just narrows a long dropdown to the handful a student
   * could plausibly mean.
   */
  const [degreeLevel, setDegreeLevel] = useState(
    degrees.find((degree) => degree.id === defaults.degreeId)?.level ?? 'bachelors',
  );

  const degreesAtLevel = degrees.filter((degree) => degree.level === degreeLevel);

  const fileInput = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  /* Object URLs hold the file in memory until explicitly released. */
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const onPhotoChosen = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setPhotoError(null);

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setPhotoError('Choose an image file.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setPhotoError('That image is over 2 MB. Choose a smaller one.');
      event.target.value = '';
      return;
    }

    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return URL.createObjectURL(file);
    });
  };

  const shownAvatar = previewUrl ?? defaults.avatarUrl;

  return (
    <StepForm action={saveBasics} submitLabel="Continue">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
        <div className="border-outline-variant/50 bg-surface-container relative size-20 shrink-0 overflow-hidden rounded-full border">
          {shownAvatar ? (
            <Image
              src={shownAvatar}
              alt=""
              fill
              sizes="80px"
              className="object-cover"
              /* Blob previews and Storage URLs are not known at build time. */
              unoptimized
            />
          ) : (
            <span className="text-outline flex h-full w-full items-center justify-center">
              <UserRound className="size-8" aria-hidden="true" />
            </span>
          )}
        </div>

        <div className="flex flex-col items-center gap-1 sm:items-start">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInput.current?.click()}
          >
            <Camera />
            {shownAvatar ? 'Change photo' : 'Add a photo'}
          </Button>
          <p className="text-outline text-label-sm font-normal">
            Optional. JPG, PNG or WebP, up to 2 MB.
          </p>
          {photoError ? (
            <p role="alert" className="text-destructive text-label-sm">
              {photoError}
            </p>
          ) : null}
        </div>

        <input
          ref={fileInput}
          type="file"
          name="avatar"
          accept="image/jpeg,image/png,image/webp"
          onChange={onPhotoChosen}
          className="sr-only"
          aria-label="Profile photo"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">Your name</Label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Israel Israeli"
        />
        <p className="text-outline text-label-sm font-normal">
          {suggestedName && !defaults.fullName
            ? 'Filled in from your email address — correct it if we guessed wrong.'
            : 'Classmates will see this when you send or receive a request.'}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="degreeLevel">Degree level</Label>
        <select
          id="degreeLevel"
          value={degreeLevel}
          onChange={(event) => {
            setDegreeLevel(event.target.value as typeof degreeLevel);
            /* The old degree may not exist at the new level. */
            setDegreeId('');
          }}
          className={selectClasses}
        >
          {DEGREE_LEVEL_OPTIONS.map((level) => (
            <option key={level.value} value={level.value}>
              {level.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="degreeId">Degree</Label>
        <select
          id="degreeId"
          name="degreeId"
          required
          value={degreeId}
          onChange={(event) => setDegreeId(event.target.value)}
          className={selectClasses}
        >
          <option value="" disabled>
            Choose your degree
          </option>
          {degreesAtLevel.map((degree) => (
            <option key={degree.id} value={degree.id}>
              {degree.name}
            </option>
          ))}
        </select>
        <p className="text-outline text-label-sm font-normal">
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="city">City</Label>
        <Input
          id="city"
          name="city"
          autoComplete="address-level2"
          required
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="Tel Aviv"
        />
        <p className="text-outline text-label-sm font-normal">
          Where you usually study. Classmates in the same city score higher.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="dateOfBirth">Date of birth</Label>
        <Input
          id="dateOfBirth"
          name="dateOfBirth"
          type="date"
          autoComplete="bday"
          value={dateOfBirth}
          onChange={(event) => setDateOfBirth(event.target.value)}
        />
        <p className="text-outline text-label-sm font-normal">
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="yearOfStudy">Year of study</Label>
        <select
          id="yearOfStudy"
          name="yearOfStudy"
          required
          value={yearOfStudy}
          onChange={(event) => setYearOfStudy(event.target.value)}
          className={selectClasses}
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
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="universityName">University</Label>
        <Input
          id="universityName"
          value={universityName}
          readOnly
          aria-describedby="university-note"
          className="bg-surface-container cursor-not-allowed"
        />
        <p id="university-note" className="text-outline text-label-sm font-normal">
          Taken from your email address, and not editable — it decides which
          classmates and courses you can see.
        </p>
      </div>
    </StepForm>
  );
}
