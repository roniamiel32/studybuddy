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
 *     0.22.0 - 2026-08-12 - Social and rating types (Phase 8D)
 *     0.20.0 - 2026-08-11 - Initial implementation (Phase 8A)
 */

export type NotificationType =
  | 'group_request'
  | 'group_promotion'
  | 'group_invite'
  | 'meeting_scheduled'
  | 'meeting_cancelled'
  | 'rate_partner'
  | 'new_match'
  | 'birthday'
  | 'match_suggestion'
  | 'wall_post'
  | 'post_like'
  | 'post_comment'
  | 'post_share'
  | 'comment_reply'
  | 'comment_like';

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
  /**
   * Whose wall the post or comment sits on. There is no page for a single post,
   * so this is where anything about one leads.
   */
  wallOwnerId: string | null;
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
 * RETURNS NULL FOR A TYPE IT DOES NOT KNOW, and that is the interesting part.
 * The enum lives in the database and gains values in a migration; a feed built
 * before that migration will be handed rows it has never heard of. Falling
 * through to null lets the list skip one row rather than throw and take the
 * whole page — a student who cannot see one notification is inconvenienced, a
 * student who cannot see the page is stuck.
 *
 * @param notification - The notification.
 * @returns Its copy and destination, or null if the type is unknown here.
 */
export function notificationCopy(notification: NotificationView): NotificationCopy | null {
  const who = notification.actorName ?? 'A classmate';
  const other = notification.secondaryName ?? 'someone else';
  const group = notification.groupName ?? 'your group';
  const meeting = notification.meetingTitle ?? 'a session';

  /* Anything about a post or a comment leads to the wall it sits on: there is no
     page for a single post, and the wall is where the thing being talked about
     actually is. */
  const wall = notification.wallOwnerId ? `/students/${notification.wallOwnerId}` : null;
  const actor = notification.actorId ? `/students/${notification.actorId}` : null;
  const groupHref = notification.groupId ? `/groups/${notification.groupId}` : null;

  switch (notification.type) {
    // ---- Groups ------------------------------------------------------------
    case 'group_request':
      return {
        message: `${who} asked to join ${group}.`,
        cta: 'Review the request',
        href: groupHref,
      };

    case 'group_promotion':
      return {
        message: `You are now an admin of ${group}.`,
        cta: 'Open the group',
        href: groupHref,
      };

    case 'group_invite':
      /* Answering happens in the inbox on /groups, not on the group's own page —
         the invitee cannot open a group they have not joined. */
      return {
        message: `${who} invited you to join ${group}.`,
        cta: 'Accept or decline',
        href: '/groups',
      };

    // ---- Meetings ----------------------------------------------------------
    case 'meeting_scheduled':
      return {
        message: `${who} scheduled ${meeting}.`,
        cta: 'See when',
        href: groupHref ?? '/dashboard',
      };

    case 'meeting_cancelled':
      return {
        message: `${meeting} was called off.`,
        cta: null,
        href: groupHref ?? '/dashboard',
      };

    case 'rate_partner':
      return {
        message: `You finished ${meeting} with ${who}.`,
        cta: 'Say how it went',
        href: actor,
      };

    // ---- Matching ----------------------------------------------------------
    case 'new_match':
      return {
        message: `${who} looks like a strong study match.`,
        cta: 'See their profile',
        href: actor,
      };

    case 'match_suggestion':
      return {
        message: `${who} and ${other} could study well together.`,
        cta: 'Suggest they connect',
        href: actor,
      };

    // ---- Social ------------------------------------------------------------
    case 'birthday':
      /*
       * The CTA is the feature. A birthday you can only read is a fact; one that
       * takes you to the place you can act on it is a reason to open the app.
       */
      return {
        message: `It is ${who}'s birthday today.`,
        cta: 'Wish them a happy birthday on their wall!',
        href: actor,
      };

    case 'wall_post':
      return {
        message: `${who} wrote on your wall.`,
        cta: 'Read it',
        href: wall ?? actor,
      };

    case 'post_like':
      return {
        message: `${who} liked your post.`,
        cta: null,
        href: wall,
      };

    case 'post_comment':
      return {
        message: `${who} commented on your post.`,
        cta: 'Read the comment',
        href: wall,
      };

    case 'post_share':
      return {
        message: `${who} shared your post.`,
        cta: null,
        href: wall ?? actor,
      };

    case 'comment_reply':
      return {
        message: `${who} replied to your comment.`,
        cta: 'Read the reply',
        href: wall,
      };

    case 'comment_like':
      return {
        message: `${who} liked your comment.`,
        cta: null,
        href: wall,
      };

    default:
      /*
       * A type the database has and this build does not. Deliberately silent:
       * it happens between a migration landing and a deploy, it corrects itself,
       * and a console full of warnings would not help the student looking at the
       * page.
       */
      return null;
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
