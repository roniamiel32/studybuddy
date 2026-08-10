/**
 * File:        src/app/(app)/settings/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Profile tab — photo, personal details, and the global study
 *              preferences every course inherits.
 * Version:     0.14.0
 *
 * Modifications:
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AvatarForm } from '@/components/profile/avatar-form';
import {
  GlobalPreferencesForm,
  ProfileDetailsForm,
} from '@/components/profile/preferences-section';
import { hasOverride } from '@/features/courses/course-view';
import { getMyCourses } from '@/features/courses/queries';
import { getOnboardingProfile, getMyPreferences } from '@/features/onboarding/queries';
import { signOut } from '@/features/auth/actions';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Profile' };

/**
 * Renders the Profile tab.
 *
 * @returns The page element.
 */
export default async function SettingsPage() {
  const [profile, preferences, courses] = await Promise.all([
    getOnboardingProfile(),
    getMyPreferences(),
    getMyCourses(),
  ]);

  /* Preferences are set in onboarding step 3; without them this page has nothing
     to edit and the student belongs back in the flow. */
  if (!preferences) {
    redirect('/onboarding/preferences');
  }

  const overriddenCourseCount = courses.filter((course) => hasOverride(course.override)).length;

  return (
    <>
      <div className="mb-8">
        <h1 className="font-heading text-[28px] leading-9 text-balance sm:text-headline-lg">
          Your profile
        </h1>
        <p className="text-on-surface-variant mt-2 text-body-md text-pretty">
          Everything here shapes who you are matched with.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <AvatarForm fullName={profile.fullName ?? 'You'} avatarUrl={profile.avatarUrl} />

        <ProfileDetailsForm
          fullName={profile.fullName ?? ''}
          city={profile.city}
          isDiscoverable={profile.isDiscoverable}
          universityName={profile.universityName}
          degreeName={profile.degreeName}
          yearOfStudy={profile.yearOfStudy}
        />

        {/* getMyPreferences returns the row as stored, shared with onboarding
            step 3. Mapped here rather than changing its shape, which would mean
            editing a query two screens already depend on. */}
        <GlobalPreferencesForm
          preferredTimeBlocks={preferences.preferred_time_blocks}
          studyEnvironments={preferences.study_environments}
          studyFormats={preferences.study_formats}
          groupSizes={preferences.group_sizes}
          spokenLanguages={preferences.spoken_languages}
          studiesOnSaturday={preferences.studies_on_saturday}
          overriddenCourseCount={overriddenCourseCount}
        />

        <section aria-labelledby="availability-heading" className="clay-card p-6">
          <h2 id="availability-heading" className="font-heading text-headline-md">
            Your week
          </h2>
          <p className="text-on-surface-variant mt-1 mb-4 text-body-md text-pretty">
            Overlapping free hours are the largest single part of a match score.
          </p>
          {/* Reuses the onboarding step rather than duplicating the grid. The
              editor is the same editor; only the way out of it differs. */}
          <Link href="/onboarding/availability" className="clay-btn-secondary rounded-md px-4 py-2 text-label-md">
            Edit your free time
          </Link>
        </section>

        <section aria-labelledby="account-heading" className="clay-card p-6">
          <h2 id="account-heading" className="font-heading text-headline-md">
            Account
          </h2>
          <p className="text-on-surface-variant mt-1 mb-4 text-body-md">
            Signed in as {profile.email}.
          </p>
          <form action={signOut}>
            <Button type="submit" variant="ghost">
              Sign out
            </Button>
          </form>
        </section>
      </div>
    </>
  );
}
