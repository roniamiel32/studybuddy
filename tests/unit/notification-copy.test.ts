/**
 * File:        tests/unit/notification-copy.test.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Every notification type renders, and an unknown one does not
 *              take the page down with it.
 *
 *              THE FALLBACK IS THE POINT. The enum lives in the database and
 *              grows in a migration, so between that landing and a deploy the
 *              feed will be handed rows this build has never heard of. Skipping
 *              one row is an inconvenience; throwing is a page a student cannot
 *              open.
 * Version:     0.22.0
 *
 * Modifications:
 *     0.22.0 - 2026-08-12 - Initial implementation (Phase 8D)
 */

import { describe, expect, it } from 'vitest';
import {
  notificationCopy,
  type NotificationType,
  type NotificationView,
} from '@/features/notifications/notification-view';

const ALL: NotificationType[] = [
  'group_request','group_promotion','group_invite','meeting_scheduled','meeting_cancelled',
  'rate_partner','new_match','birthday','match_suggestion','wall_post','post_like',
  'post_comment','post_share','comment_reply','comment_like',
];

function view(type: NotificationType, overrides: Partial<NotificationView> = {}): NotificationView {
  return {
    id: 'n1', type,
    actorId: 'a1', actorName: 'Maya Shalev', actorAvatarUrl: null,
    secondaryId: 'b1', secondaryName: 'Amit Shani',
    groupId: 'g1', groupName: 'Sunday revision',
    meetingId: 'm1', meetingTitle: 'Past papers',
    wallOwnerId: 'w1',
    isRead: false, createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('notificationCopy', () => {
  it('renders a sentence and a destination for every type the database can produce', () => {
    for (const type of ALL) {
      const copy = notificationCopy(view(type));
      expect(copy, type).not.toBeNull();
      expect(copy!.message.length, type).toBeGreaterThan(0);
      expect(copy!.href, type).not.toBeNull();
    }
  });

  it('returns null for a type this build has never heard of', () => {
    /* The case that happens between a migration landing and a deploy. */
    expect(notificationCopy(view('something_new' as NotificationType))).toBeNull();
  });

  it('addresses a suggestion to one of the pair, never to the mutual connection', () => {
    /*
     * The bug this replaced: the row went to the person who already knew both,
     * reading "Maya and Amit could study well together". It now goes to one of
     * them, names only the other, and leaves the mutual connection unnamed —
     * secondaryName is set here precisely to prove it does not leak into the
     * sentence.
     */
    const copy = notificationCopy(view('match_suggestion'));

    expect(copy).not.toBeNull();
    expect(copy!.message).toBe(
      'You and Maya Shalev share a mutual study connection. You might study well together!',
    );
    expect(copy!.message).not.toMatch(/Amit Shani/);
    /* It leads to the person being suggested, not to the bridge. */
    expect(copy!.href).toBe('/students/a1');
  });

  it('survives a notification whose subject has deleted their account', () => {
    const copy = notificationCopy(
      view('post_like', { actorId: null, actorName: null, wallOwnerId: null }),
    );

    expect(copy).not.toBeNull();
    expect(copy!.message).toMatch(/A classmate/);
    /* No wall to point at, so no link — the row still renders, just inert. */
    expect(copy!.href).toBeNull();
  });
});
