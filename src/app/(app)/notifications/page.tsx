/**
 * File:        src/app/(app)/notifications/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Alerts tab — everything that happened, the two social prompts
 *              that did not happen so much as become true, and since Phase 9D the
 *              join requests waiting on you.
 *
 *              A PAGE RATHER THAN A DROPDOWN, deliberately. Every other
 *              destination in this navbar is a page, the feed carries calls to
 *              action worth reading rather than glancing at, and a dropdown on a
 *              phone is a panel that covers the thing it is describing. The bell
 *              still carries the unread count, which is the part a dropdown would
 *              have given us.
 *
 *              REQUESTS SIT ABOVE THE FEED because they are the only thing here
 *              that is blocking somebody else — a classmate cannot get into a
 *              group until an admin answers.
 * Version:     0.20.0
 *
 * Modifications:
 *     0.26.0 - 2026-08-13 - Join requests moved here from Groups (Phase 9D)
 *     0.20.0 - 2026-08-11 - Initial implementation (Phase 8A)
 */

import type { Metadata } from 'next';

import { InvitationInbox } from '@/components/groups/invitation-inbox';
import { NotificationList } from '@/components/notifications/notification-list';
import { PendingRequestsSection } from '@/components/notifications/pending-requests-section';
import { getMyNotifications } from '@/features/notifications/queries';
import {
  getMyGroups,
  getMyInvitations,
  getMyPendingRequests,
} from '@/features/groups/queries';

export const metadata: Metadata = { title: 'Notifications' };

/**
 * Renders the notification feed.
 *
 * @returns The page element.
 */
export default async function NotificationsPage() {
  /* Materialises today's derived notifications before reading — see the note in
     features/notifications/queries.ts. */
  const [notifications, pending, groups, invitations] = await Promise.all([
    getMyNotifications(),
    getMyPendingRequests(),
    getMyGroups(),
    getMyInvitations(),
  ]);

  return (
    <>
      <div className="mb-8">
        <h1 className="font-heading text-[28px] leading-9 text-balance sm:text-headline-lg">
          Notifications
        </h1>
        <p className="text-on-surface-variant mt-2 text-body-md text-pretty">
          Stay up to date with the latest updates and announcements.
        </p>
      </div>
{/*
        INVITATIONS CAME WITH THE REQUESTS, and they had to. They lived on the
        Groups tab too, and are the one thing on it that only this student can
        answer — leaving them behind would have meant a student who is invited to
        a group has no way at all to accept. Above the requests, because an
        invitation is blocking THEM while a request is blocking somebody else.
      */}
      <InvitationInbox invitations={invitations} />

  
      <NotificationList 
        notifications={notifications} 
        pendingRequests={pending} 
        adminGroups={groups} 
      />
    </>
  );
}
