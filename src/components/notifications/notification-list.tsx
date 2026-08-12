/**
 * File:        src/components/notifications/notification-list.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The notification feed.
 *
 *              EVERY ROW IS A LINK TO THE PLACE IT IS ABOUT, and reading it marks
 *              it read on the way. A feed you have to dismiss separately from
 *              acting on it makes people do the same job twice.
 *
 *              THE SOCIAL ONES CARRY THEIR CALL TO ACTION IN THE COPY rather than
 *              as a second button — "wish them a happy birthday on their wall!"
 *              is both the reason to tap and the description of where it goes,
 *              and a row with two controls makes the student choose between two
 *              things that do the same thing.
 * Version:     0.20.0
 *
 * Modifications:
 *     0.20.0 - 2026-08-11 - Initial implementation (Phase 8A)
 */

'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CalendarClock,
  CalendarX,
  Cake,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { markAllNotificationsRead, markNotificationRead } from '@/features/notifications/actions';
import {
  notificationCopy,
  timeAgo,
  type NotificationType,
  type NotificationView,
} from '@/features/notifications/notification-view';
import { cn } from '@/lib/utils';

export interface NotificationListProps {
  notifications: NotificationView[];
}

/** The icon for a type, when there is no person to show an avatar for. */
const ICONS: Record<NotificationType, typeof Bell> = {
  group_request: Users,
  group_promotion: Sparkles,
  meeting_scheduled: CalendarClock,
  meeting_cancelled: CalendarX,
  new_match: Sparkles,
  birthday: Cake,
  match_suggestion: UserPlus,
};

/**
 * Renders the feed.
 *
 * @param notifications - The caller's notifications, newest first.
 * @returns The list element.
 */
export function NotificationList({ notifications }: NotificationListProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const unread = notifications.filter((notification) => !notification.isRead).length;

  if (notifications.length === 0) {
    return (
      <p className="text-on-surface-variant bg-surface-container rounded-md p-5 text-body-md text-pretty">
        Nothing yet. Join requests, new matches, sessions and birthdays will show up here.
      </p>
    );
  }

  return (
    <>
      {unread > 0 ? (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await markAllNotificationsRead();
                router.refresh();
              })
            }
            className="text-on-surface-variant hover:text-brand focus-visible:ring-brand/35 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
          >
            Mark all as read
          </button>
        </div>
      ) : null}

      <ul aria-label="Notifications" className="flex flex-col gap-2">
        {notifications.map((notification) => {
          const copy = notificationCopy(notification);
          const Icon = ICONS[notification.type];

          const body = (
            <>
              {notification.actorId ? (
                <MatchAvatar
                  fullName={notification.actorName ?? 'Classmate'}
                  avatarUrl={notification.actorAvatarUrl}
                  size={36}
                  className="border-2"
                />
              ) : (
                <span className="bg-brand-fixed/60 text-brand flex size-9 shrink-0 items-center justify-center rounded-full">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
              )}

              <span className="min-w-0 flex-1">
                <span className="text-label-md block text-pretty">{copy.message}</span>
                {copy.cta ? (
                  <span className="text-brand block text-label-sm font-normal">{copy.cta}</span>
                ) : null}
              </span>

              <span className="text-outline shrink-0 text-label-sm font-normal">
                {timeAgo(notification.createdAt)}
              </span>
            </>
          );

          const className = cn(
            'flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors',
            'focus-visible:ring-brand/35 focus-visible:ring-4 focus-visible:outline-none',
            notification.isRead
              ? 'border-outline-variant/50 bg-white'
              : /* Unread is tinted rather than dotted: the whole row is the
                   thing that is new, and a dot on a list of dots is noise. */
                'border-brand/40 bg-brand-fixed/40',
          );

          return (
            <li key={notification.id}>
              {copy.href ? (
                <Link
                  href={copy.href}
                  onClick={() => {
                    if (!notification.isRead) {
                      void markNotificationRead({ notificationId: notification.id });
                    }
                  }}
                  className={cn(className, 'hover:border-brand/60')}
                >
                  {body}
                </Link>
              ) : (
                <div className={className}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
