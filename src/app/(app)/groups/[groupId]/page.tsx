/**
 * File:        src/app/(app)/groups/[groupId]/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: One study group: its members, its chat, and — for the admin — the
 *              join requests waiting on them.
 *
 *              A group the viewer cannot see is a 404, and so is one they can see
 *              but have not joined: the chat is members-only, and the page is mostly
 *              chat. Discovery happens on the course page, which is where a
 *              non-member belongs.
 * Version:     0.15.0
 *
 * Modifications:
 *     0.15.0 - 2026-08-10 - Initial implementation (Phase 5)
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, Users } from 'lucide-react';

import { ApplicantRow } from '@/components/groups/applicant-review-dialog';
import { GroupChat } from '@/components/groups/group-chat';
import { GroupSettingsDialog } from '@/components/groups/group-settings-dialog';
import { InvitePanel } from '@/components/groups/invite-panel';
import { MemberRow } from '@/components/groups/member-row';
import { Chip } from '@/components/ui/chip';
import {
  getGroup,
  getGroupMessages,
  getInvitableClassmates,
} from '@/features/groups/queries';
import { getChatMeetings } from '@/features/meetings/queries';
import { placesLeft } from '@/features/groups/group-view';
import { getMyCourse } from '@/features/courses/queries';
import { requireUser } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Study group' };

/**
 * Renders one group.
 *
 * @param params - Route parameters carrying the group id.
 * @returns The page element.
 */
export default async function GroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  const [user, group] = await Promise.all([requireUser(), getGroup(groupId)]);

  if (!group || !group.isMember) {
    notFound();
  }

  const [messages, course, meetings, invitable] = await Promise.all([
    getGroupMessages(groupId),
    getMyCourse(group.courseOfferingId),
    getChatMeetings({ groupId }),
    /* Only an admin can act on this, and only an admin is shown it. The policy
       refuses the insert either way — this just avoids the round trip. */
    group.isAdmin ? getInvitableClassmates(groupId) : Promise.resolve([]),
  ]);

  const left = placesLeft(group);

  /* Names for messages that arrive over the socket, which carries ids only. */
  const memberNames = Object.fromEntries(
    group.members.map((member) => [member.profileId, member.fullName]),
  );

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2">
        <ol className="text-on-surface-variant flex items-center gap-2">
          <li>
            <Link href="/courses" className="hover:text-brand text-label-sm transition-colors">
              Your courses
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="size-4" />
          </li>
          <li>
            <Link
              href={`/courses/${group.courseOfferingId}`}
              className="hover:text-brand text-label-sm transition-colors"
            >
              {course?.code ?? 'Course'}
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="size-4" />
          </li>
          <li className="text-brand text-label-sm">Group</li>
        </ol>
      </nav>

      <div className="mb-8">
        <h1 className="font-heading text-[28px] leading-9 text-balance sm:text-headline-lg">
          {group.name}
        </h1>
        <p className="text-on-surface-variant mt-2 text-body-md text-pretty">
          {group.description ?? `A study group for ${course?.name ?? 'this course'}.`}
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <aside className="flex flex-col gap-6 lg:col-span-4">
          <section aria-labelledby="members-heading" className="clay-card p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="members-heading" className="font-heading text-headline-md">
                Members
              </h2>
              <Chip tone={left === 0 ? 'neutral' : 'mint'}>
                <Users className="size-3" aria-hidden="true" />
                {group.members.length} of {group.maxParticipants}
              </Chip>
            </div>

            {group.isAdmin ? (
              <div className="mb-4">
                <GroupSettingsDialog
                  groupId={group.id}
                  name={group.name}
                  description={group.description}
                  maxParticipants={group.maxParticipants}
                  memberCount={group.members.length}
                />
              </div>
            ) : null}

            {/* Named, like every other list in the app: "list, 3 items" tells a
                screen-reader user nothing about which list they are in. */}
            <ul aria-label="Members" className="flex flex-col gap-3">
              {group.members.map((member) => (
                <MemberRow
                  key={member.profileId}
                  groupId={group.id}
                  member={member}
                  viewerId={user.id}
                  viewerIsAdmin={group.isAdmin}
                  viewerIsFounder={group.isFounder}
                />
              ))}
            </ul>
          </section>

{/* ---- Inviting ----------------------------------------------------- */}
          {group.isAdmin ? (
            <section aria-labelledby="invite-heading" className="clay-card p-5">
              <h2 id="invite-heading" className="font-heading text-headline-md">
                Invite a classmate
              </h2>
              <InvitePanel 
                groupId={group.id} 
                classmates={invitable} 
                members={group.members}
                requests={group.pendingRequests}
                placesLeft={left} 
              />
            </section>
          ) : null}
          {/* ---- The admin's requests ----------------------------------------- */}
          {group.isAdmin ? (
            <section aria-labelledby="requests-heading" className="clay-card p-5">
              <div className="mb-1 flex items-center justify-between gap-3">
                <h2 id="requests-heading" className="font-heading text-headline-md">
                  Join requests
                </h2>
                {group.pendingRequests.length > 0 ? (
                  <Chip tone="sunset">{group.pendingRequests.length} waiting</Chip>
                ) : null}
              </div>

              {group.pendingRequests.length === 0 ? (
                <p className="text-on-surface-variant mt-2 text-body-md text-pretty">
                  Nothing waiting. Requests from classmates in this course will appear
                  here.
                </p>
              ) : (
                <>
                  <p className="text-on-surface-variant mt-1 mb-4 text-body-md text-pretty">
                    Open one to see who they are before deciding.
                  </p>
                  <ul aria-label="Pending requests" className="flex flex-col gap-2">
                    {group.pendingRequests.map((request) => (
                      <ApplicantRow key={request.id} request={request} placesLeft={left} />
                    ))}
                  </ul>
                </>
              )}
            </section>
          ) : null}
        </aside>

        <div className="lg:col-span-8">
          <GroupChat
            groupId={group.id}
            initialMessages={messages}
            viewerId={user.id}
            memberNames={memberNames}
            meetings={meetings}
            groupName={group.name}
            courseCode={course?.code ?? null}
          />
        </div>
      </div>
    </>
  );
}
