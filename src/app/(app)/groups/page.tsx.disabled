/**
 * File:        src/app/(app)/groups/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Groups tab — every study group the student belongs to, and the
 *              join requests waiting on them.
 *
 *              Added alongside the navigation redesign, which gives Groups a
 *              top-level tab. Groups are still CREATED and DISCOVERED on a course
 *              page, because a group belongs to a course; this is the place you come
 *              back to once you are in one.
 * Version:     0.16.0
 *
 * Modifications:
 *     0.16.0 - 2026-08-10 - Initial implementation
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { Crown, MessagesSquare, Users } from 'lucide-react';

import { ApplicantRow } from '@/components/groups/applicant-review-dialog';
import { InvitationInbox } from '@/components/groups/invitation-inbox';
import { MatchAvatar } from '@/components/matching/match-avatar';
import { Chip } from '@/components/ui/chip';
import { placesLeft } from '@/features/groups/group-view';
import {
  getMyGroups,
  getMyInvitations,
  getMyPendingRequests,
} from '@/features/groups/queries';

export const metadata: Metadata = { title: 'Your groups' };

/**
 * Renders the Groups tab.
 *
 * @returns The page element.
 */
export default async function GroupsPage() {
  const [groups, pending, invitations] = await Promise.all([
    getMyGroups(),
    getMyPendingRequests(),
    getMyInvitations(),
  ]);

  return (
    <>
      <div className="mb-8">
        <h1 className="font-heading text-[28px] leading-9 text-balance sm:text-headline-lg">
          Your groups
        </h1>
        <p className="text-on-surface-variant mt-2 text-body-md text-pretty">
          {groups.length === 0
            ? 'Study groups live on a course page — open one of your courses to create or join a group.'
            : 'Groups you are in. Open one to talk to its members.'}
        </p>
      </div>

      {/* Invitations above requests: only this student can answer one, so it is
          the item most likely to be blocking somebody else. */}
      <InvitationInbox invitations={invitations} />

      {/* Requests next: they are the thing waiting on the student to act. */}
      {pending.length > 0 ? (
        <section aria-labelledby="waiting-heading" className="clay-card mb-6 p-5">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 id="waiting-heading" className="font-heading text-headline-md">
              Waiting for you
            </h2>
            <Chip tone="sunset">
              {pending.length} {pending.length === 1 ? 'request' : 'requests'}
            </Chip>
          </div>
          <p className="text-on-surface-variant mt-1 mb-4 text-body-md text-pretty">
            Classmates who have asked to join a group you run.
          </p>

          <ul aria-label="Pending requests" className="flex flex-col gap-2">
            {pending.map((request) => {
              const group = groups.find((candidate) => candidate.id === request.groupId);

              return (
                <ApplicantRow
                  key={request.id}
                  request={request}
                  placesLeft={group ? placesLeft(group) : 0}
                />
              );
            })}
          </ul>
        </section>
      ) : null}

      {groups.length > 0 ? (
        <ul aria-label="Your groups" className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
          {groups.map((group) => {
            const left = placesLeft(group);

            return (
              <li key={group.id} className="clay-card flex flex-col p-5">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h2 className="font-heading text-[17px] leading-snug text-balance">
                    {group.name}
                  </h2>
                  {group.isAdmin ? (
                    <Chip tone="brand">
                      <Crown className="size-3" aria-hidden="true" />
                      Admin
                    </Chip>
                  ) : null}
                </div>

                {group.description ? (
                  <p className="text-on-surface-variant mb-3 text-body-md text-pretty">
                    {group.description}
                  </p>
                ) : null}

                <ul aria-label="Members" className="mb-3 flex flex-wrap items-center gap-1.5">
                  {group.members.slice(0, 6).map((member) => (
                    <li key={member.profileId} title={member.fullName}>
                      <MatchAvatar
                        fullName={member.fullName}
                        avatarUrl={member.avatarUrl}
                        size={28}
                        className="border-2"
                      />
                    </li>
                  ))}
                  {group.members.length > 6 ? (
                    <li className="text-outline text-label-sm font-normal">
                      +{group.members.length - 6}
                    </li>
                  ) : null}
                </ul>

                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Chip tone={left === 0 ? 'neutral' : 'mint'}>
                    <Users className="size-3" aria-hidden="true" />
                    {group.members.length} of {group.maxParticipants}
                  </Chip>
                  {group.status === 'closed' ? <Chip tone="neutral">Closed</Chip> : null}
                  {group.isAdmin && group.pendingRequests.length > 0 ? (
                    <Chip tone="sunset">
                      {group.pendingRequests.length}{' '}
                      {group.pendingRequests.length === 1 ? 'request' : 'requests'} waiting
                    </Chip>
                  ) : null}
                </div>

                <Link
                  href={`/groups/${group.id}`}
                  className="clay-btn-secondary focus-visible:ring-brand/35 mt-auto flex items-center justify-center gap-2 rounded-md px-4 py-2 text-label-md focus-visible:ring-4 focus-visible:outline-none"
                >
                  <MessagesSquare className="size-4" aria-hidden="true" />
                  Open group
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="clay-card flex flex-col items-center p-8 text-center sm:p-12">
          <span className="bg-brand-fixed text-brand mb-4 flex size-14 items-center justify-center rounded-full">
            <Users className="size-7" aria-hidden="true" />
          </span>

          <h2 className="font-heading text-headline-md">No groups yet</h2>
          <p className="text-on-surface-variant mt-2 max-w-md text-body-md text-pretty">
            A study group belongs to a course, so that is where you make or join one.
          </p>

          <Link href="/courses" className="clay-btn-primary mt-6 rounded-full px-6 py-3 text-label-md">
            Go to your courses
          </Link>
        </div>
      )}
    </>
  );
}
