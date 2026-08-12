/**
 * File:        src/features/notifications/queries.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Reads for the notification feed and its badge.
 *
 *              THE FEED SYNCS BEFORE IT READS. Birthdays, strong new matches and
 *              suggestions have no event behind them, so rpc_sync_notifications
 *              materialises today's before the select runs. It is idempotent —
 *              guarded by partial unique indexes — so opening the dropdown twice
 *              inserts nothing the second time.
 *
 *              THE BADGE DOES NOT SYNC. It renders in the layout on every page,
 *              and running the derived queries that often would turn a count into
 *              the most expensive thing on the site. The consequence is honest
 *              and small: a birthday shows up in the badge once the student opens
 *              the feed, or on their next navigation after something real
 *              happened.
 * Version:     0.20.0
 *
 * Modifications:
 *     0.22.1 - 2026-08-12 - Take the comment back out of the select string, and
 *                           report the error instead of rendering an empty feed
 *     0.20.0 - 2026-08-11 - Initial implementation (Phase 8A)
 */

import 'server-only';

import { createClient, requireUser } from '@/lib/supabase/server';

import type { NotificationType, NotificationView } from './notification-view';

/*
 * The embeds `wall_posts` and `post_comments` carry whose wall the post is on —
 * the only sensible destination for a like, a comment or a share, since there is
 * no per-post page to link to.
 *
 * NO COMMENTS INSIDE THIS STRING. It is not code, it is the `select` query
 * parameter PostgREST parses, and supabase-js strips the whitespace out of it
 * before sending — so a block comment written here arrives as one unbroken run
 * of letters in the middle of the field list, and fails the whole request with
 * PGRST100. The failure is invisible from the page: the feed comes back empty
 * and renders as "nothing yet", while the badge, which embeds nothing, counts on
 * regardless.
 */
const NOTIFICATION_SELECT = `
  id,
  type,
  actor_id,
  secondary_id,
  group_id,
  meeting_id,
  read_at,
  created_at,
  actor:profiles!notifications_actor_id_fkey ( full_name, avatar_url ),
  secondary:profiles!notifications_secondary_id_fkey ( full_name ),
  study_groups ( name ),
  meetings ( title ),
  wall_posts ( profile_owner_id ),
  post_comments ( post_id, wall_posts ( profile_owner_id ) )
`;

interface NotificationRow {
  id: string;
  type: NotificationType;
  actor_id: string | null;
  secondary_id: string | null;
  group_id: string | null;
  meeting_id: string | null;
  read_at: string | null;
  created_at: string;
  actor: { full_name: string | null; avatar_url: string | null } | null;
  secondary: { full_name: string | null } | null;
  study_groups: { name: string } | null;
  meetings: { title: string } | null;
  wall_posts: { profile_owner_id: string } | null;
  post_comments: { post_id: string; wall_posts: { profile_owner_id: string } | null } | null;
}

/**
 * Shapes a joined row into the view model.
 *
 * @param row - The joined notification row.
 * @returns The view model.
 */
function toNotificationView(row: NotificationRow): NotificationView {
  return {
    id: row.id,
    type: row.type,
    actorId: row.actor_id,
    actorName: row.actor?.full_name ?? null,
    actorAvatarUrl: row.actor?.avatar_url ?? null,
    secondaryId: row.secondary_id,
    secondaryName: row.secondary?.full_name ?? null,
    groupId: row.group_id,
    groupName: row.study_groups?.name ?? null,
    meetingId: row.meeting_id,
    meetingTitle: row.meetings?.title ?? null,
    /* A comment carries its post's wall; a post carries its own. */
    wallOwnerId:
      row.wall_posts?.profile_owner_id ??
      row.post_comments?.wall_posts?.profile_owner_id ??
      null,
    isRead: row.read_at !== null,
    createdAt: row.created_at,
  };
}

/**
 * The caller's notifications, newest first.
 *
 * @param limit - How many to return.
 * @returns Their feed.
 */
export async function getMyNotifications(limit = 20): Promise<NotificationView[]> {
  const user = await requireUser();
  const supabase = await createClient();

  /* Materialise the derived ones first, so the feed is complete when it renders
     rather than a page behind. */
  await supabase.rpc('rpc_sync_notifications');

  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_SELECT)
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  /*
   * Reported rather than swallowed, for the same reason the wall reports its
   * own: a malformed select returns null data and no rows, and an empty feed is
   * indistinguishable from a feed that failed to load — except by the badge,
   * which goes on showing a count for notifications the page will not display.
   */
  if (error) {
    throw new Error(`Could not read your notifications: ${error.message}`);
  }

  return ((data ?? []) as unknown as NotificationRow[]).map(toNotificationView);
}

/**
 * How many notifications the caller has not read.
 *
 * Deliberately does NOT sync — see the note at the top of this file.
 *
 * @returns The unread count.
 */
export async function getUnreadNotificationCount(): Promise<number> {
  const user = await requireUser();
  const supabase = await createClient();

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', user.id)
    .is('read_at', null);

  return count ?? 0;
}
