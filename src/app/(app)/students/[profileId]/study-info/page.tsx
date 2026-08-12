/**
 * File:        src/app/(app)/students/[profileId]/study-info/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The study side of a profile — what you have in common, how they
 *              study, and the groups you share.
 *
 *              THIS WAS THE PROFILE until Phase 8B. It is unchanged apart from
 *              living behind "Learn more": the wall became the default view
 *              because a profile is a social object first, and the study data is
 *              what you come for once you already know who someone is.
 *
 *              The header is the same component the wall renders, so the avatar
 *              and the name lead back rather than nowhere.
 * Version:     0.20.0
 *
 * Modifications:
 *     0.20.0 - 2026-08-11 - Split out of the profile page (Phase 8B)
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookOpen, Pencil, Users } from 'lucide-react';

import { MessageButton } from '@/components/matching/message-button';
import { ProfileHeader } from '@/components/profiles/profile-header';
import { RatePartnerDialog } from '@/components/profiles/rate-partner-dialog';
import { Chip } from '@/components/ui/chip';
import { ExpandableList } from '@/components/ui/expandable-list';
import {
  connectionsSummary,
  preferenceSections,
  profileSubtitle,
} from '@/features/profiles/profile-view';
import { getStudentProfile } from '@/features/profiles/queries';

export const metadata: Metadata = { title: 'Study info' };

/**
 * 0-40: #FF6B7D
 * 41-79: #FF8A50
 * 80-100: #4f7b58ff
 */
function getCompatibilityColor(score: number): string {
  if (score <= 40) return '#FF6B7D';
  if (score <= 79) return '#FF8A50';
  return '#4f7b58ff';
}

/**
 * Renders the study information for a profile.
 *
 * @param params - Route parameters carrying the profile id.
 * @returns The page element.
 */
export default async function StudentStudyInfoPage({
  params,
}: {
  params: Promise<{ profileId: string }>;
}) {
  const { profileId } = await params;
  const profile = await getStudentProfile(profileId);

  if (!profile) {
    notFound();
  }

  const sections = preferenceSections(profile);

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
                  rateeName={profile.fullName.split(' ')[0]}
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
        {/* ---- What you have in common (or Your Classes if viewing self) ---- */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          {!profile.isSelf ? (
            <section aria-labelledby="common-heading" className="clay-card p-5">
              <h2 id="common-heading" className="font-heading text-headline-md">
                You two
              </h2>

              {profile.compatibilityScore !== null ? (
                <div className="border-outline-variant/30 bg-surface-container-low mt-4 rounded-lg border p-4">
                  <p className="text-outline text-label-sm">Compatibility</p>
                  <p
                    className="font-heading text-headline-lg font-bold"
                    style={{
                      color: getCompatibilityColor(Math.round(profile.compatibilityScore)),
                    }}
                  >
                    {Math.round(profile.compatibilityScore)}%
                  </p>
                  <p className="text-on-surface-variant text-label-sm font-normal">
                    Best across your shared courses, from{' '}
                    {profile.compatibilityCourseCode}.
                  </p>
                </div>
              ) : (
                <p className="text-on-surface-variant mt-3 text-body-md text-pretty">
                  No compatibility score — you may not share a course this semester.
                </p>
              )}

              <h3 className="text-on-surface-variant mt-5 mb-2 text-label-md tracking-wider uppercase">
                Shared courses
              </h3>
              {profile.sharedCourses.length > 0 ? (
                <ExpandableList
                  limit={2}
                  items={profile.sharedCourses.map((course) => (
                    <div key={course.offeringId}>
                      <Link
                        href={`/courses/${course.offeringId}`}
                        className="border-outline-variant/60 hover:border-brand/60 focus-visible:ring-brand/35 flex items-center gap-3 rounded-md border bg-white p-3 transition-colors focus-visible:ring-4 focus-visible:outline-none"
                      >
                        <BookOpen className="text-brand size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="text-label-md block truncate">{course.name}</span>
                          <span className="text-outline block text-label-sm font-normal">
                            {course.code}
                          </span>
                        </span>
                      </Link>
                    </div>
                  ))}
                />
              ) : (
                <p className="text-on-surface-variant text-body-md">
                  No courses in common this semester.
                </p>
              )}

              <h3 className="text-on-surface-variant mt-5 mb-2 text-label-md tracking-wider uppercase">
                Shared groups
              </h3>
              {profile.sharedGroups.length > 0 ? (
                <ExpandableList
                  limit={2}
                  items={profile.sharedGroups.map((group) => (
                    <div key={group.id}>
                      <Link
                        href={`/groups/${group.id}`}
                        className="border-outline-variant/60 hover:border-brand/60 focus-visible:ring-brand/35 flex items-center gap-3 rounded-md border bg-white p-3 transition-colors focus-visible:ring-4 focus-visible:outline-none"
                      >
                        <Users className="text-brand size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="text-label-md block truncate">{group.name}</span>
                          <span className="text-outline block text-label-sm font-normal">
                            {group.memberCount}{' '}
                            {group.memberCount === 1 ? 'member' : 'members'}
                          </span>
                        </span>
                      </Link>
                    </div>
                  ))}
                />
              ) : (
                <p className="text-on-surface-variant text-body-md">
                  You are not in a study group together.
                </p>
              )}
            </section>
          ) : (
            <section aria-labelledby="my-classes-heading" className="clay-card p-5">
              <h2 id="my-classes-heading" className="font-heading text-headline-md">
                Your classes
              </h2>

              <h3 className="text-on-surface-variant mt-5 mb-2 text-label-md tracking-wider uppercase">
                Your courses
              </h3>
              {profile.sharedCourses.length > 0 ? (
                <ExpandableList
                  limit={2}
                  items={profile.sharedCourses.map((course) => (
                    <div key={course.offeringId}>
                      <Link
                        href={`/courses/${course.offeringId}`}
                        className="border-outline-variant/60 hover:border-brand/60 focus-visible:ring-brand/35 flex items-center gap-3 rounded-md border bg-white p-3 transition-colors focus-visible:ring-4 focus-visible:outline-none"
                      >
                        <BookOpen className="text-brand size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="text-label-md block truncate">{course.name}</span>
                          <span className="text-outline block text-label-sm font-normal">
                            {course.code}
                          </span>
                        </span>
                      </Link>
                    </div>
                  ))}
                />
              ) : (
                <p className="text-on-surface-variant text-body-md">
                  You haven&apos;t added any courses yet.
                </p>
              )}

              <h3 className="text-on-surface-variant mt-5 mb-2 text-label-md tracking-wider uppercase">
                Your groups
              </h3>
              {profile.sharedGroups.length > 0 ? (
                <ExpandableList
                  limit={2}
                  items={profile.sharedGroups.map((group) => (
                    <div key={group.id}>
                      <Link
                        href={`/groups/${group.id}`}
                        className="border-outline-variant/60 hover:border-brand/60 focus-visible:ring-brand/35 flex items-center gap-3 rounded-md border bg-white p-3 transition-colors focus-visible:ring-4 focus-visible:outline-none"
                      >
                        <Users className="text-brand size-4 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="text-label-md block truncate">{group.name}</span>
                          <span className="text-outline block text-label-sm font-normal">
                            {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                          </span>
                        </span>
                      </Link>
                    </div>
                  ))}
                />
              ) : (
                <p className="text-on-surface-variant text-body-md">
                  You are not in any study groups.
                </p>
              )}
            </section>
          )}
        </div>

        {/* ---- How they study, and who they have studied with --------------- */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          <section aria-labelledby="preferences-heading" className="clay-card p-5">
            <h2 id="preferences-heading" className="font-heading text-headline-md">
              How {profile.isSelf ? 'you' : profile.fullName.split(' ')[0]} study
            </h2>

            {sections.length > 0 ? (
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                {sections.map((section) => (
                  <div key={section.heading}>
                    <dt className="text-outline mb-1.5 text-label-sm">{section.heading}</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {section.values.map((value) => (
                        <Chip key={value.label} tone="neutral" icon={value.icon}>
                          {value.label}
                        </Chip>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-on-surface-variant mt-3 text-body-md">
                {profile.isSelf
                  ? 'You have not answered the study questions yet.'
                  : 'They have not answered the study questions yet.'}
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
