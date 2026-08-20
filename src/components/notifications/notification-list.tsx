/**
 * File:        src/components/notifications/notification-list.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The notification feed.
 * Version:     0.51.0
 *
 * Modifications:
 *     0.51.0 - 2026-08-20 - Explicit newest-first ordering; the reader's own name
 *                           renders as "you"
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
  Check,
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
  sortNotifications,
  timeAgo,
  type NotificationType,
  type NotificationView,
} from '@/features/notifications/notification-view';
import { cn } from '@/lib/utils';

// Imports for the specific Group Request UI
import { ApplicantReviewDialog } from '@/components/groups/applicant-review-dialog';
import { ProfileLink } from '@/components/profiles/profile-link';
import { Chip } from '@/components/ui/chip';
import { placesLeft, type StudyGroupView, type GroupRequestView } from '@/features/groups/group-view';

export interface NotificationListProps {
  notifications: NotificationView[];
  pendingRequests?: GroupRequestView[];
  adminGroups?: StudyGroupView[];
  /** The reader's own name, so a sentence about them says "you". */
  viewerName?: string | null;
}

const PAGE_SIZE = 7;

const ICONS: Partial<Record<NotificationType, typeof Bell>> = {
  group_request: Users,
  group_promotion: Sparkles,
  group_invite: MailPlus,
  group_join_approved: Check,
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
export function NotificationList({
  notifications,
  pendingRequests = [],
  adminGroups = [],
  viewerName = null,
}: NotificationListProps) {
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

  /*
   * NO DEDUPE HERE ANY MORE, and its removal is the fix for a bug it caused.
   *
   * It was added when requestToJoin re-inserted a request on every press, so one
   * pending request could be named by nine notifications and the feed drew nine
   * identical review cards. That write is gone and the leftovers were dismissed
   * by a migration, so the only thing this collapsing still did was hide REAL
   * history: a student who is refused and asks again months later produces a
   * second, legitimate notification, and keying on (actor, group) threw away
   * everything but the newest — so the admin watched a person's whole past with
   * their group vanish the moment they reapplied.
   */
  const renderable = useMemo(
    () =>
      /* Newest first, sorted here rather than trusted from upstream — see
         sortNotifications for why the tie-break matters. */
      sortNotifications(notifications).flatMap((notification) => {
        if (dismissed.has(notification.id)) {
          return [];
        }

        const copy = notificationCopy(notification, viewerName);
        return copy ? [{ notification, copy }] : [];
      }),
    [notifications, dismissed, viewerName],
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
           * MATCHED ON THE REQUEST ITSELF, which the notification now names.
           *
           * It used to be matched on (actor, group) — the only handle the row
           * carried — and that pair identified exactly one thing only while a
           * student could hold one request per group ever. Keeping history ended
           * that: somebody who joined, left and asked again answers to the same
           * pair several times over, so every one of their old notifications
           * matched the single live request and every one drew a Review button
           * for a decision that had been made days ago.
           *
           * `find` rather than a boolean, because pendingRequests holds only
           * live ones: an id that is not in it has been decided, and the card
           * below falls through to the plain, read-only layout. Notifications
           * written before the column existed carry null and land there too,
           * which is the right way round — history reading as history.
           */
          const request = isGroupRequest
            ? pendingRequests.find((r) => r.id === notification.groupRequestId)
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
                  {/* This row is a div, not a link, so both the face and the
                      name can reach the applicant's profile — which is the
                      first thing an admin wants before deciding. */}
                  <ProfileLink
                    profileId={notification.actorId}
                    label={`${notification.actorName ?? 'Classmate'}’s profile`}
                    className="shrink-0"
                  >
                    <MatchAvatar
                      fullName={notification.actorName ?? 'Classmate'}
                      avatarUrl={notification.actorAvatarUrl}
                      size={36}
                      className="border-2"
                    />
                  </ProfileLink>
                  <span className="min-w-0 flex-1">
                    <span className="block text-label-md text-pretty">
                      <LinkedActorMessage notification={notification} message={copy.message} />
                    </span>
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

          /*
           * Standard layout, built as a STRETCHED LINK rather than a link
           * wrapping the row.
           *
           * The row used to be one anchor around everything, which left the
           * avatar and the name unreachable: they were inside a link going
           * somewhere else, and an anchor inside an anchor is invalid markup
           * that navigates to whichever the browser decides. Here the card is a
           * plain container, the message carries `after:absolute after:inset-0`
           * so the whole card still answers a click on the empty space, and the
           * two profile links sit above that overlay on `relative z-10`.
           *
           * The result reads the same and behaves better: the card goes where it
           * always went, the person goes to the person. The X needs the same
           * lift for the same reason — it is a sibling of the overlay, not above
           * it by default.
           */
          const actorName = notification.actorName ?? 'Classmate';

          return (
            <li key={notification.id} className="relative">
              <div className={cn(className, 'pr-12')}>
                {notification.actorId ? (
                  <ProfileLink
                    profileId={notification.actorId}
                    label={`${actorName}’s profile`}
                    className="relative z-10 shrink-0"
                  >
                    <MatchAvatar
                      fullName={actorName}
                      avatarUrl={notification.actorAvatarUrl}
                      size={36}
                      className="border-2"
                    />
                  </ProfileLink>
                ) : (
                  <span className="bg-brand-fixed/60 text-brand flex size-9 shrink-0 items-center justify-center rounded-full">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                )}

                <span className="min-w-0 flex-1">
                  <span className="relative z-10 block text-label-md text-pretty">
                    <LinkedActorMessage notification={notification} message={copy.message} />
                  </span>

                  {copy.href ? (
                    <Link
                      href={copy.href}
                      onClick={() => {
                        if (!notification.isRead) {
                          void markNotificationRead({ notificationId: notification.id });
                        }
                      }}
                      className="text-brand block text-label-sm font-normal after:absolute after:inset-0 after:content-['']"
                    >
                      {copy.cta ?? <span className="sr-only">Open</span>}
                    </Link>
                  ) : copy.cta ? (
                    <span className="text-brand block text-label-sm font-normal">
                      {copy.cta}
                    </span>
                  ) : null}
                </span>

                <span className="text-outline relative z-10 ml-2 shrink-0 text-label-sm font-normal">
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
/**
 * A notification's sentence, with the person's name made a link to them.
 *
 * SPLIT ON A CHECKED PREFIX, NOT A REGEX. Every actor-driven message in
 * notification-view is built as `${who} <did something>`, so the name is a known
 * prefix rather than something to be found by pattern — and if a future message
 * ever stops leading with it, `startsWith` fails, the whole sentence renders
 * plain, and nobody sees a mangled string. Parsing the rendered copy at all is
 * the compromise here: the alternative is for notificationCopy to return the
 * name as its own field, which is the better shape and a wider change.
 *
 * @returns The message, with a linked name where there is one to link.
 */
function LinkedActorMessage({
  notification,
  message,
}: {
  notification: NotificationView;
  message: string;
}) {
  const name = notification.actorName;

  if (!name || !notification.actorId || !message.startsWith(name)) {
    return <>{message}</>;
  }

  return (
    <>
      <ProfileLink profileId={notification.actorId} className="font-semibold">
        {name}
      </ProfileLink>
      {message.slice(name.length)}
    </>
  );
}

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
      /* z-20 clears the row's stretched-link overlay. Without it the X is
         underneath a full-card anchor and every dismiss opens the notification
         instead. */
      className="text-outline hover:text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/35 absolute top-1/2 right-2 z-20 flex size-7 -translate-y-1/2 items-center justify-center rounded-full transition-colors focus-visible:ring-4 focus-visible:outline-none"
    >
      <X className="size-4" aria-hidden="true" />
    </button>
  );
}
