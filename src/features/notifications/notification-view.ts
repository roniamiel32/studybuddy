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
 * Version:     0.52.0
 *
 * Modifications:
 *     0.52.0 - 2026-08-20 - Active voice throughout; a session is named as a
 *                           phrase rather than dropped in as a raw title
 *     0.51.0 - 2026-08-20 - A notification says "you" rather than the reader's
 *                           own name; sortNotifications
 *     0.24.0 - 2026-08-13 - A suggestion addresses one of the pair, not the
 *                           mutual connection who bridged them
 *     0.22.0 - 2026-08-12 - Social and rating types (Phase 8D)
 *     0.20.0 - 2026-08-11 - Initial implementation (Phase 8A)
 */

export type NotificationType =
  | 'group_request'
  | 'group_joined'
  | 'group_promotion'
  | 'group_invite'
  | 'group_join_approved'
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
   * The chat a session belongs to — exactly one of these, as on `meetings`.
   *
   * WHY THEY ARE HERE AT ALL. notify_meeting_scheduled writes meeting_id and
   * nothing else, so a meeting notification carries no group_id and no
   * conversation_id of its own. "See when" therefore fell through to /dashboard
   * every single time, for group sessions as well as direct ones — the fallback
   * was doing all the work and the intended destination was never reachable.
   */
  meetingConversationId: string | null;
  meetingGroupId: string | null;
  /**
   * The join request this notification announces, for group_request rows.
   *
   * WHAT MAKES A REVIEW BUTTON APPEAR. The feed used to find the live request by
   * (actor, group), which identified one thing only while a student could hold
   * one request per group ever. Now that history is kept, that pair names
   * several — so every old notification matched the one live request and drew
   * its own Review button. This is the identity the pair was standing in for.
   *
   * Null on rows written before the column existed, and on every other type.
   * Null means "not the live request", which is the safe way to be wrong: a
   * stale card reads as history rather than offering a decision that cannot be
   * made.
   */
  groupRequestId: string | null;
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

import { isDefaultMeetingTitle } from '@/features/meetings/meeting-view';

/**
 * Names a session in a way that survives being put inside a sentence.
 *
 * A TITLE IS NOT A NOUN PHRASE, which is what broke the old copy. Sessions are
 * titled "Study session with Dana Levi" by default, and dropping that into
 * `${meeting} was called off` produced "Study session with you was called off"
 * — passive, mid-sentence capital, and silent about who did it.
 *
 * The two kinds of title need opposite treatment, and isDefaultMeetingTitle is
 * what tells them apart:
 *
 *   A GENERATED TITLE IS ALREADY A DESCRIPTION, so it is lowercased and given an
 *   article: "the study session with you". It reads as English because that is
 *   what it was.
 *
 *   A TITLE A STUDENT TYPED IS A NAME, so it is quoted and left exactly as
 *   written: "Past papers" stays capitalised, keeps its own words, and cannot be
 *   mistaken for our prose. Quoting is also what stops a title like "cancelled"
 *   turning the sentence into nonsense.
 *
 * @param title      - The meeting's stored title.
 * @param determiner - Which article a generated title should take. "a" for a
 *                     session being announced, "the" for one already known about.
 * @returns The phrase, ready to sit inside a sentence.
 */
export function meetingPhrase(title: string | null, determiner: 'a' | 'the'): string {
  const trimmed = title?.trim();

  if (!trimmed) {
    return `${determiner} study session`;
  }

  if (isDefaultMeetingTitle(trimmed)) {
    return `${determiner} ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
  }


  return `\u201c${trimmed}\u201d`;
}

/**
 * Whether a session's title is one this app wrote rather than one a student did.
 *
 * An absent title counts as generated: there is nothing of the student's to
 * preserve, so the sentence is free to describe the session in its own words.
 *
 * @param title - The meeting's stored title.
 * @returns Whether the copy may rewrite it.
 */
function isGeneratedTitle(title: string | null): boolean {
  const trimmed = title?.trim();

  return !trimmed || isDefaultMeetingTitle(trimmed);
}

/** Sentence case, for the rare line that has to start with a session. */
function capitalise(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * Rewrites the reader's own name as "you".
 *
 * WHY A STRING PASS RATHER THAN PER-TYPE COPY. The reader's name reaches these
 * sentences from two directions: as the actor, and — since sessions were renamed
 * "Study session with <partner>" — inside a meeting title that the database
 * stores as one string. The second cannot be fixed by rewording a template,
 * because the name is data rather than a slot. One pass over the finished
 * sentence catches both, and catches whatever the next source turns out to be.
 *
 * WHOLE WORDS ONLY. A substring replace would turn a classmate called "Roni
 * Amiel-Cohen" into "you-Cohen" for a reader named Roni Amiel. The boundaries
 * are checked against the characters either side rather than with \b, which does
 * not understand accented letters — and these are student names.
 *
 * The possessive is handled first, or "Roni Amiel's birthday" becomes "you's".
 *
 * @param message    - The finished sentence.
 * @param viewerName - The reader's full name, or null when it is not known.
 * @returns The sentence, addressed to the reader.
 */
export function addressReader(message: string, viewerName: string | null): string {
  const name = viewerName?.trim();

  if (!name) {
    return message;
  }

  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* Letters, digits, apostrophes and hyphens all continue a name, so a match
     that touches one is part of a longer name and is left alone. */
  const boundary = String.raw`(?<![\p{L}\p{N}'\-])`;
  const after = String.raw`(?![\p{L}\p{N}\-])`;

  const personalised = message
    .replace(new RegExp(`${boundary}${escaped}['\u2019]s${after}`, 'gu'), 'your')
    .replace(new RegExp(`${boundary}${escaped}${after}`, 'gu'), 'you');

  /* "you scheduled a session" at the head of a sentence wants a capital. */
  return personalised.replace(/^you\b/, 'You').replace(/^your\b/, 'Your');
}

/**
 * Orders a feed newest first.
 *
 * THE QUERY ALREADY ORDERS BY created_at DESC, so this is belt and braces rather
 * than the only ordering — but the feed is assembled from rows written by three
 * different triggers plus rpc_sync_notifications, and the component should not
 * depend on every one of them having agreed. The id tie-break is what keeps two
 * rows written in the same millisecond in the same order on the server and on
 * the client; without it React is free to hydrate a different sequence than it
 * rendered, which is a mismatch that reproduces on somebody else's machine only.
 *
 * @param notifications - The feed, in any order.
 * @returns A new array, newest first.
 */
export function sortNotifications<T extends { createdAt: string; id: string }>(
  notifications: readonly T[],
): T[] {
  return [...notifications].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  );
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
 * @param viewerName    - The reader's own name, so the sentence can say "you".
 *                        Optional, so a caller that has no profile to hand still
 *                        gets a correct sentence rather than a compile error.
 * @returns Its copy and destination, or null if the type is unknown here.
 */
export function notificationCopy(
  notification: NotificationView,
  viewerName: string | null = null,
): NotificationCopy | null {
  const who = notification.actorName ?? 'A classmate';
  const group = notification.groupName ?? 'your group';
  /* Whether there is a real person to name. `who` always reads as a person, so
     the copy needs this to know when to fall back to a subjectless sentence. */
  const named = Boolean(notification.actorName);

  const wall = notification.wallOwnerId ? `/students/${notification.wallOwnerId}` : null;
  const actor = notification.actorId ? `/students/${notification.actorId}` : null;
  const groupHref = notification.groupId ? `/groups/${notification.groupId}` : null;

  /*
   * Where a session lives: the group page, or the direct thread it was booked
   * from. Falls back to the group the notification names, then to the dashboard
   * — but only genuinely reaches that last step for a meeting whose chat has
   * since been deleted, rather than on every notification as it used to.
   */
  const meetingHref = notification.meetingGroupId
    ? `/groups/${notification.meetingGroupId}`
    : notification.meetingConversationId
      ? `/messages/${notification.meetingConversationId}`
      : (groupHref ?? '/dashboard');

  const copy = buildCopy(notification, {
    who,
    named,
    group,
    wall,
    actor,
    groupHref,
    meetingHref,
  });

  return copy ? { ...copy, message: addressReader(copy.message, viewerName) } : null;
}

/**
 * The per-type sentence, before the reader's name is folded into it.
 *
 * Split out so addressReader runs in exactly one place rather than at each of
 * seventeen return statements.
 *
 * @param notification - The notification.
 * @param parts        - The pre-computed names and destinations.
 * @returns Its copy, or null if the type is unknown here.
 */
function buildCopy(
  notification: NotificationView,
  parts: {
    who: string;
    named: boolean;
    group: string;
    wall: string | null;
    actor: string | null;
    groupHref: string | null;
    meetingHref: string;
  },
): NotificationCopy | null {
  const { who, named, group, wall, actor, groupHref, meetingHref } = parts;
  const title = notification.meetingTitle;

  switch (notification.type) {
    // ---- Groups ------------------------------------------------------------
    case 'group_request':
      return {
        message: `${who} asked to join ${group}.`,
        cta: 'Review the request',
        href: groupHref,
      };

    case 'group_joined':
      return {
        message: named
          ? `${who} approved your request to join ${group}.`
          : `Your request to join ${group} was approved.`,
        cta: 'Go to group chat',
        href: groupHref,
      };

    case 'group_promotion':
      /* actor_id is nulled when a student promoted themselves, which is the one
         case where naming the actor would read as "You made you an admin". */
      return {
        message: named
          ? `${who} made you an admin of ${group}.`
          : `You are now an admin of ${group}.`,
        cta: 'Open the group',
        href: groupHref,
      };

    case 'group_invite':
      return {
        message: `${who} added you to ${group}.`,
        cta: 'Go to group chat',
        href: groupHref,
      };

    // ---- Meetings ----------------------------------------------------------
    case 'group_join_approved':
      return {
        message: `${who} accepted your request to join ${group}.`,
        cta: 'Open the group',
        href: groupHref,
      };

    case 'meeting_scheduled':
      /* "a", not "the": this is the announcement, so the session is new to the
         reader at the moment they read it. */
      return {
        message: `${who} scheduled ${meetingPhrase(title, 'a')}.`,
        cta: 'See when',
        href: meetingHref,
      };

    case 'meeting_cancelled':
      /*
       * THE SENTENCE THIS REVIEW STARTED FROM. It read "<title> was called off",
       * which was passive, opened mid-sentence with a capitalised title, and hid
       * the one fact the reader actually wants: who called it off. The trigger
       * has recorded that as actor_id since the type existed — the copy simply
       * never asked for it.
       *
       * The subjectless form survives for a cancelled_by that has gone null,
       * which happens when the organiser deletes their account.
       */
      return {
        message: named
          ? `${who} called off ${meetingPhrase(title, 'the')}.`
          : capitalise(`${meetingPhrase(title, 'the')} was called off.`),
        cta: null,
        href: meetingHref,
      };

    case 'rate_partner':
      /*
       * NAMED ONCE, NOT TWICE. A generated title already says who the session
       * was with, so "You finished a study session with Dana Levi with Dana
       * Levi" was the literal output here once sessions started being titled
       * after their partner. A title somebody typed carries information the
       * sentence does not, so that one is kept and the name sits beside it.
       */
      return {
        message: isGeneratedTitle(title)
          ? `You studied with ${who}.`
          : `You finished ${meetingPhrase(title, 'the')} with ${who}.`,
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
        message: `You and ${who} share a mutual study connection. You might study well together!`,
        cta: 'See their profile',
        href: actor,
      };

    // ---- Social ------------------------------------------------------------
    case 'birthday':
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