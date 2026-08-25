/**
 * File:        src/app/(app)/students/[profileId]/meeting-history/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The private third view of a profile — every study session the
 *              student has scheduled through StudyBuddy.
 *
 *              IT IS A ROUTE RATHER THAN A TAB ON THE WALL, for the same reason
 *              /study-info is: the wall is a feed, and hanging a second feed off
 *              it behind a client-side toggle would mean fetching both on every
 *              visit to either. A route also gives it a URL a student can
 *              bookmark, and gives Next a boundary to cache it on.
 *
 *              PRIVATE MEANS 404, NOT "HIDDEN". Two locks, and the outer one is
 *              the real one: getMyMeetingHistory reads the caller's own rows and
 *              takes no profile id at all, so there is no id anybody could put
 *              in this URL that would return somebody else's sessions. The
 *              isSelf check below exists so a classmate is told the page does
 *              not exist rather than being shown an empty one, which would
 *              otherwise read as "they have never studied with anyone".
 * Version:     0.47.0
 *
 * Modifications:
 *     0.47.0 - 2026-08-19 - Initial implementation
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil } from 'lucide-react';

import { MeetingHistoryList } from '@/components/meetings/meeting-history-list';
import { ProfileHeader } from '@/components/profiles/profile-header';
import { connectionsSummary, profileSubtitle } from '@/features/profiles/profile-view';
import { getMyMeetingHistory } from '@/features/meetings/queries';
import { getStudentProfile } from '@/features/profiles/queries';

export const metadata: Metadata = { title: 'Meeting history' };

/**
 * Renders a student's own meeting history.
 *
 * @param params - Route parameters carrying the profile id.
 * @returns The page element.
 */
export default async function MeetingHistoryPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const profile = await getStudentProfile(profileId);

  if (!profile || !profile.isSelf) {
    notFound();
  }

  const entries = await getMyMeetingHistory();

  return (
    <>
      <ProfileHeader
        profileId={profile.id}
        fullName={profile.fullName}
        avatarUrl={profile.avatarUrl}
        subtitle={profileSubtitle(profile)}
        universityName={profile.universityName}
        city={profile.city}
        weeklyFreeHours={profile.weeklyFreeHours}
        connectionsSummary={connectionsSummary(profile.positiveConnections.length)}
        statusMessage={profile.statusMessage}
        isSelf={profile.isSelf}
        actions={
          <Link
            href="/settings"
            className="clay-btn-secondary flex items-center gap-2 rounded-md px-4 py-2 text-label-md"
          >
            <Pencil className="size-4" aria-hidden="true" />
            Edit your profile
          </Link>
        }
      />

      <MeetingHistoryList entries={entries} />
    </>
  );
}
