/**
 * File:        src/app/(app)/settings/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Profile tab — photo, personal details, and the global study
 *              preferences every course inherits.
 * Version:     0.46.0
 *
 * Modifications:
 *     0.46.0 - 2026-08-18 - Google Calendar sync card
 *     0.23.0 - 2026-08-12 - Change password and delete account (Phase 9A)
 *     0.19.0 - 2026-08-11 - The week is edited in place, not in onboarding
 *     0.14.0 - 2026-08-10 - Initial implementation (Phase 4)
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CalendarSyncCard } from '@/components/calendar/calendar-sync-card';
import { AvailabilityDialog } from '@/components/profile/availability-dialog';
import { AvatarForm } from '@/components/profile/avatar-form';
import { ChangePasswordForm } from '@/components/profile/change-password-form';
import { DeleteAccountSection } from '@/components/profile/delete-account-section';
import {
  GlobalPreferencesForm,
  ProfileDetailsForm,
} from '@/components/profile/preferences-section';
import { getCalendarStatus } from '@/features/calendar/queries';
import { hasOverride } from '@/features/courses/course-view';
import { getMyCourses } from '@/features/courses/queries';
import {
  getMyAvailability,
  getOnboardingProfile,
  getMyPreferences,
} from '@/features/onboarding/queries';
import { signOut } from '@/features/auth/actions';
import { Button } from '@/components/ui/button';

import { EnablePushNotifications } from '@/components/notifications/EnablePushNotifications';

export const metadata: Metadata = { title: 'Profile' };

/**
 * Renders the Profile tab.
 *
 * @returns The page element.
 */
export default async function SettingsPage() {
  const [profile, preferences, courses, slots, calendar] = await Promise.all([
    getOnboardingProfile(),
    getMyPreferences(),
    getMyCourses(),
    getMyAvailability(),
    getCalendarStatus(),
  ]);

  /* Preferences are set in onboarding step 3; without them this page has nothing
     to edit and the student belongs back in the flow. */
  if (!preferences) {
    redirect('/onboarding/preferences');
  }

  const overriddenCourseCount = courses.filter((course) => hasOverride(course.override)).length;

  /*
   * PostgreSQL returns `time` as "08:00:00"; the grid keys on "08:00". Only
   * manual slots are editable here — synced ones are owned by the calendar
   * integration and must not be silently rewritten by this form.
   */
  const selectedSlots = slots
    .filter((slot) => slot.source === 'manual')
    .map((slot) => `${slot.day_of_week}|${slot.starts_at.slice(0, 5)}|${slot.ends_at.slice(0, 5)}`);

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
          <div className="mb-4">
            <CalendarSyncCard status={calendar} origin="settings" />
          </div>

          {calendar.syncEnabled ? (
            <p className="bg-surface-container text-on-surface-variant mb-4 rounded-md p-3 text-label-md">
              Your week is coming from Google Calendar. Editing it by hand switches back
              to a hand-drawn week and stops syncing.
            </p>
          ) : null}

          {/* Reuses the onboarding grid rather than duplicating it. The editor
              is the same editor; only the way out of it differs. */}
          <AvailabilityDialog defaultSelected={selectedSlots} />
        </section>

<section aria-labelledby="notifications-heading" className="clay-card p-6">
          <h2 id="notifications-heading" className="font-heading text-headline-md">
            Notifications
          </h2>
          <p className="text-on-surface-variant mt-1 mb-4 text-body-md text-pretty">
            Manage your push notifications to stay updated on matches and messages.
          </p>
          <EnablePushNotifications />
        </section>

        <ChangePasswordForm />

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

        {/* Last on the page, deliberately: the destructive action should be the
            thing you have to scroll past everything else to reach. */}
        <DeleteAccountSection />
      </div>
    </>
  );
}
