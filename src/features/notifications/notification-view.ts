/**
 * File:        src/features/notifications/notification-view.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: View models for the notification feed, and the copy each type
 *              renders as.
 *
 *              THE SENTENCE LIVES HERE, not in the database. A notification row
 *              stores what happened and who it involves; turning that into
 *              "Maya asked to join Thursday revision" is presentation, and
 *              storing the sentence would mean a copy change could not reach the
 *              notifications already sent.
 * Version:     0.20.0
 *
 * Modifications:
 *     0.20.0 - 2026-08-11 - Initial implementation (Phase 8A)
 */

export type NotificationType =
  | 'group_request'
  | 'group_promotion'
  | 'meeting_scheduled'
  | 'meeting_cancelled'
  | 'new_match'
  | 'birthday'
  | 'match_suggestion';

export interface NotificationView {
  id: string;
  type: NotificationType;
  /** Who did it, or who it is about. */
  actorName: string | null;
  actorId: string | null;
  actorAvatarUrl: string | null;
  /** The second party of a suggestion. */
  secondaryName: string | null;
  secondaryId: string | null;
  groupId: string | null;
  groupName: string | null;
  meetingId: string | null;
  meetingTitle: string | null;
  isRead: boolean;
  createdAt: string;
}

/** What a notification says, and where pressing it goes. */
export interface NotificationCopy {
  message: string;
  /** The call to action, when there is something to do rather than just know. */
  cta: string | null;
  href: string | null;
}

/**
 * Turns a notification into the sentence and link it renders as.
 *
 * @param notification - The notification.
 * @returns Its copy and destination.
 */
export function notificationCopy(notification: NotificationView): NotificationCopy {
  const who = notification.actorName ?? 'A classmate';
  const other = notification.secondaryName ?? 'someone else';
  const group = notification.groupName ?? 'your group';
  const meeting = notification.meetingTitle ?? 'a session';

  switch (notification.type) {
    case 'group_request':
      return {
        message: `${who} asked to join ${group}.`,
        cta: 'Review the request',
        href: notification.groupId ? `/groups/${notification.groupId}` : null,
      };

    case 'group_promotion':
      return {
        message: `You are now an admin of ${group}.`,
        cta: 'Open the group',
        href: notification.groupId ? `/groups/${notification.groupId}` : null,
      };

    case 'meeting_scheduled':
      return {
        message: `${who} scheduled ${meeting}.`,
        cta: 'See when',
        href: notification.groupId ? `/groups/${notification.groupId}` : '/dashboard',
      };

    case 'meeting_cancelled':
      return {
        message: `${meeting} was called off.`,
        cta: null,
        href: notification.groupId ? `/groups/${notification.groupId}` : '/dashboard',
      };

    case 'new_match':
      return {
        message: `${who} looks like a strong study match.`,
        cta: 'See their profile',
        href: notification.actorId ? `/students/${notification.actorId}` : null,
      };

    case 'birthday':
      /*
       * The CTA is the feature. A birthday you can only read is a fact; one that
       * takes you to the place you can act on it is a reason to open the app.
       */
      return {
        message: `It is ${who}'s birthday today.`,
        cta: 'Wish them a happy birthday on their wall!',
        href: notification.actorId ? `/students/${notification.actorId}` : null,
      };

    case 'match_suggestion':
      return {
        message: `${who} and ${other} could study well together.`,
        cta: 'Suggest they connect',
        href: notification.actorId ? `/students/${notification.actorId}` : null,
      };
  }
}

/**
 * How long ago, in the shortest honest form.
 *
 * @param iso - When it happened.
 * @returns "just now", "3h", "2d".
 */
export function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));

  if (minutes < 2) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours}h`;
  }

  return `${Math.round(hours / 24)}d`;
}
