/**
 * File:        src/app/(app)/notifications/page.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The Alerts tab — everything that happened, and the two social
 *              prompts that did not happen so much as become true.
 *
 *              A PAGE RATHER THAN A DROPDOWN, deliberately. Every other
 *              destination in this navbar is a page, the feed carries calls to
 *              action worth reading rather than glancing at, and a dropdown on a
 *              phone is a panel that covers the thing it is describing. The bell
 *              still carries the unread count, which is the part a dropdown would
 *              have given us.
 * Version:     0.20.0
 *
 * Modifications:
 *     0.20.0 - 2026-08-11 - Initial implementation (Phase 8A)
 */

import type { Metadata } from 'next';

import { NotificationList } from '@/components/notifications/notification-list';
import { getMyNotifications } from '@/features/notifications/queries';

export const metadata: Metadata = { title: 'Notifications' };

/**
 * Renders the notification feed.
 *
 * @returns The page element.
 */
export default async function NotificationsPage() {
  /* Materialises today's derived notifications before reading — see the note in
     features/notifications/queries.ts. */
  const notifications = await getMyNotifications();

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

      <NotificationList notifications={notifications} />
    </>
  );
}
