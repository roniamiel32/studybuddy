/**
 * File:        src/app/(app)/students/[profileId]/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: A student's profile — the wall, which is now the default view.
 *
 *              WHAT MOVED, AND WHY. Until Phase 8B this page was the study data:
 *              compatibility, shared courses, how they study, shared groups. All
 *              of it now lives at /study-info behind "Learn more", unchanged.
 *              A profile is a social object first — you arrive knowing the name
 *              and wanting the person, and you go looking for the study numbers
 *              once you have decided you are interested.
 *
 *              WHAT STAYED: the header, and the study connections. Connections
 *              are the one piece of study data that is also social — they are
 *              people, and §15.5 makes them the thing this whole product is
 *              trying to produce.
 * Version:     0.20.0
 *
 * Modifications:
 *     0.20.0 - 2026-08-11 - The wall becomes the default view (Phase 8B)
 *     0.18.2 - 2026-08-11 - Expandable lists, action order
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil, Sparkles } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { MessageButton } from '@/components/matching/message-button';
import { ProfileHeader } from '@/components/profiles/profile-header';
import { RatePartnerDialog } from '@/components/profiles/rate-partner-dialog';
import { WallFeed } from '@/components/profiles/wall-feed';
import { Chip } from '@/components/ui/chip';
import { connectionsSummary, profileSubtitle } from '@/features/profiles/profile-view';
import { getStudentProfile } from '@/features/profiles/queries';
import { canPostOnWall, getWallPosts } from '@/features/wall/queries';

export const metadata: Metadata = { title: 'Profile' };

/**
 * Renders a student's profile wall.
 *
 * @param params - Route parameters carrying the profile id.
 * @returns The page element.
 */
export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const profile = await getStudentProfile(profileId);

  if (!profile) {
    notFound();
  }

  const [posts, canPost] = await Promise.all([
    getWallPosts(profileId),
    canPostOnWall(profileId),
  ]);

  const firstName = profile.fullName.split(' ')[0];

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
        actions={
          profile.isSelf ? (
            <Link
              href="/settings"
              className="clay-btn-secondary flex items-center gap-2 rounded-md px-4 py-2 text-label-md"
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit your profile
            </Link>
          ) : (
            <>
              {profile.canRate ? (
                <RatePartnerDialog
                  rateeId={profile.id}
                  rateeName={firstName}
                  myRating={profile.myRating}
                  courseOfferingId={profile.sharedCourses[0]?.offeringId ?? null}
                />
              ) : null}

              <MessageButton
                partnerId={profile.id}
                courseOfferingId={profile.sharedCourses[0]?.offeringId ?? null}
                partnerName={profile.fullName}
              />
            </>
          )
        }
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* ---- Study connections -------------------------------------------- */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          <section aria-labelledby="connections-heading" className="clay-card p-5">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h2 id="connections-heading" className="font-heading text-headline-md">
                Study connections
              </h2>
              {profile.positiveConnections.length > 0 ? (
                <Chip tone="mint">{profile.positiveConnections.length}</Chip>
              ) : null}
            </div>

            <p className="text-on-surface-variant mt-1 mb-4 text-body-md text-pretty">
              Classmates who studied with {profile.isSelf ? 'you' : firstName} and said it
              went well.
            </p>

            {profile.positiveConnections.length > 0 ? (
              <ul aria-label="Study connections" className="flex flex-col gap-2">
                {profile.positiveConnections.map((connection) => (
                  <li key={connection.raterId}>
                    <Link
                      href={`/students/${connection.raterId}`}
                      className="border-outline-variant/60 hover:border-brand/60 focus-visible:ring-brand/35 flex items-center gap-3 rounded-md border bg-white p-3 transition-colors focus-visible:ring-4 focus-visible:outline-none"
                    >
                      <MatchAvatar
                        fullName={connection.raterName}
                        avatarUrl={connection.raterAvatarUrl}
                        size={36}
                        className="border-2"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-label-md block truncate">
                          {connection.raterName}
                        </span>
                        <span className="text-outline block text-label-sm font-normal">
                          Studied together
                          {connection.courseCode ? ` · ${connection.courseCode}` : ''}
                        </span>
                      </span>
                      <Sparkles className="text-brand size-4 shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-on-surface-variant bg-surface-container rounded-md p-4 text-body-md text-pretty">
                {profile.isSelf
                  ? 'None yet. After you study with someone, they can say it went well and it will show here.'
                  : 'None yet.'}
              </p>
            )}
          </section>
        </div>

        {/* ---- The wall ------------------------------------------------------ */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          <WallFeed
            profileOwnerId={profile.id}
            firstName={firstName}
            isSelf={profile.isSelf}
            canPost={canPost}
            posts={posts}
          />
        </div>
      </div>
    </>
  );
}
