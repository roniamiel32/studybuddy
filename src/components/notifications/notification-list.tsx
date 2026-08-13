/**
 * File:        src/components/notifications/notification-list.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The notification feed.
 * Version:     0.21.2
 */

'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Cake,
  CalendarClock,
  CalendarX,
  Heart,
  MailPlus,
  MessageCircle,
  MessageSquare,
  PenLine,
  Repeat2,
  Sparkles,
  Star,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/features/notifications/actions';
import {
  notificationCopy,
  timeAgo,
  type NotificationType,
  type NotificationView,
} from '@/features/notifications/notification-view';
import { cn } from '@/lib/utils';

// Imports for the specific Group Request UI
import { ApplicantReviewDialog } from '@/components/groups/applicant-review-dialog';
import { Chip } from '@/components/ui/chip';
import { placesLeft, type StudyGroupView, type GroupRequestView } from '@/features/groups/group-view';

export interface NotificationListProps {
  notifications: NotificationView[];
  pendingRequests?: GroupRequestView[];
  adminGroups?: StudyGroupView[];
}

const PAGE_SIZE = 7;

const ICONS: Partial<Record<NotificationType, typeof Bell>> = {
  group_request: Users,
  group_promotion: Sparkles,
  group_invite: MailPlus,
  meeting_scheduled: CalendarClock,
  meeting_cancelled: CalendarX,
  rate_partner: Star,
  new_match: Sparkles,
  match_suggestion: UserPlus,
  birthday: Cake,
  wall_post: PenLine,
  post_like: Heart,
  post_comment: MessageSquare,
  post_share: Repeat2,
  comment_reply: MessageCircle,
  comment_like: Heart,
};

/**
 * Renders the feed.
 */
export function NotificationList({ notifications, pendingRequests = [], adminGroups = [] }: NotificationListProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useState(PAGE_SIZE);

  const unread = notifications.filter((notification) => !notification.isRead).length;

  /*
   * Dismissed rows leave the list at once rather than waiting for the server.
   * The action is a write plus a revalidation, and a row that sat there for a
   * round trip after being dismissed would invite a second press — which is a
   * second write for a row that is already gone.
   */
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());

  const renderable = useMemo(
    () =>
      notifications.flatMap((notification) => {
        if (dismissed.has(notification.id)) {
          return [];
        }

        const copy = notificationCopy(notification);
        return copy ? [{ notification, copy }] : [];
      }),
    [notifications, dismissed],
  );

  const visible = renderable.slice(0, shown);
  const remaining = renderable.length - visible.length;

  if (notifications.length === 0) {
    return (
      <p className="bg-surface-container text-on-surface-variant rounded-md p-5 text-body-md text-pretty">
        Nothing yet. Requests, matches, sessions, birthdays and anything that happens on
        your wall will show up here.
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
        {visible.map(({ notification, copy }) => {
          const Icon = ICONS[notification.type] ?? Bell;
          const isGroupRequest = notification.type === 'group_request';
          
          /*
           * Matched on WHO asked and WHICH group, because that pair identifies
           * exactly one pending request. A group_request notification carries the
           * requester as its actor and the group it is about, so both halves are
           * to hand.
           *
           * Not matched on the name: two classmates called Daniel Levy would show
           * each other's request. Not matched on a request id either — the
           * notification does not carry one, which is what `entityId` was
           * reaching for.
           */
          const request = isGroupRequest
            ? pendingRequests.find(
                (r) =>
                  r.requesterId === notification.actorId &&
                  r.groupId === notification.groupId,
              )
            : null;

          const className = cn(
            'flex w-full items-center gap-3 rounded-md border p-3 text-left transition-colors',
            'focus-visible:ring-brand/35 focus-visible:ring-4 focus-visible:outline-none hover:border-brand/60',
            notification.isRead
              ? 'border-outline-variant/50 bg-white'
              : 'border-brand/40 bg-brand-fixed/40',
          );

          // Render the Inline Review layout if it is a pending request and we found the matching request
          if (isGroupRequest && request) {
            const group = adminGroups.find((g) => g.id === request.groupId);

            return (
              <li key={notification.id} className="relative">
                <div className={cn(className, 'pr-3')}>
                  <MatchAvatar
                    fullName={notification.actorName ?? 'Classmate'}
                    avatarUrl={notification.actorAvatarUrl}
                    size={36}
                    className="border-2"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-label-md text-pretty">{copy.message}</span>
                  </span>

                  {/* Pending Chip & Review Button */}
                  <div 
                    className="flex shrink-0 items-center gap-3 ml-2"
                    onClick={() => {
                      if (!notification.isRead) {
                        void markNotificationRead({ notificationId: notification.id });
                      }
                    }}
                  >
                    <Chip tone="sunset">Pending</Chip>
                    <ApplicantReviewDialog request={request} placesLeft={group ? placesLeft(group) : 0} />
                  </div>

                  <span className="text-outline shrink-0 text-label-sm font-normal ml-2 mr-6">
                    {timeAgo(notification.createdAt)}
                  </span>
                </div>

                <DismissButton
                  notificationId={notification.id}
                  onDismissed={() =>
                    setDismissed((current) => new Set(current).add(notification.id))
                  }
                />
              </li>
            );
          }

          // Standard notification layout for everything else
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
                <span className="block text-label-md text-pretty">{copy.message}</span>
                {copy.cta ? (
                  <span className="text-brand block text-label-sm font-normal">{copy.cta}</span>
                ) : null}
              </span>

              <span className="text-outline shrink-0 text-label-sm font-normal ml-2">
                {timeAgo(notification.createdAt)}
              </span>
            </>
          );

          return (
            <li key={notification.id} className="relative">
              {/*
                The X is a SIBLING of the row, not a child of it. The row is an
                anchor when it has a destination, and a button inside an anchor
                is invalid markup that navigates when pressed. Absolute
                positioning puts it where it looks nested; `pr-12` on the row
                keeps the timestamp from sliding under it.
              */}
              {copy.href ? (
                <Link
                  href={copy.href}
                  onClick={() => {
                    if (!notification.isRead) {
                      void markNotificationRead({ notificationId: notification.id });
                    }
                  }}
                  className={cn(className, 'pr-12')}
                >
                  {body}
                </Link>
              ) : (
                <div className={cn(className, 'pr-12')}>{body}</div>
              )}

              <DismissButton
                notificationId={notification.id}
                onDismissed={() =>
                  setDismissed((current) => new Set(current).add(notification.id))
                }
              />
            </li>
          );
        })}
      </ul>

      {/* Pagination Controls */}
      {(remaining > 0 || shown > PAGE_SIZE) ? (
        <div className="mt-4 flex gap-3">
          {remaining > 0 ? (
            <button
              type="button"
              onClick={() => setShown((count) => count + PAGE_SIZE)}
              className="clay-btn-secondary focus-visible:ring-brand/35 flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-label-md focus-visible:ring-4 focus-visible:outline-none"
            >
              Load more
            </button>
          ) : null}

          {shown > PAGE_SIZE ? (
            <button
              type="button"
              onClick={() => setShown(PAGE_SIZE)}
              className="clay-btn-secondary focus-visible:ring-brand/35 flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-label-md focus-visible:ring-4 focus-visible:outline-none"
            >
              Show less
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
/**
 * The X that clears one notification from the feed.
 *
 * OPTIMISTIC, AND NOT REVERTED ON FAILURE. Dismissing is not a claim about the
 * world — nothing is destroyed and nothing is told to anyone — so a row that
 * vanishes and stays vanished until the next load is the least surprising
 * outcome of a failed write. Putting it back would be a flicker explaining a
 * problem the student cannot act on.
 *
 * @param notificationId - Which notification.
 * @param onDismissed    - Called once the press is registered.
 * @returns The button element.
 */
function DismissButton({
  notificationId,
  onDismissed,
}: {
  notificationId: string;
  onDismissed: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Dismiss this notification"
      onClick={() => {
        onDismissed();
        startTransition(async () => {
          await dismissNotification({ notificationId });
        });
      }}
      className="text-outline hover:text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/35 absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors focus-visible:ring-4 focus-visible:outline-none"
    >
      <X className="size-4" aria-hidden="true" />
    </button>
  );
}
