/**
 * File:        src/features/meetings/queries.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Reads for scheduled study sessions.
 *
 *              Every query runs as the signed-in student, so the Phase 7C
 *              policies have already narrowed meetings to ones they were invited
 *              to before this code sees a row.
 *
 *              A CANCELLED RSVP DOES NOT HIDE THE MEETING. The strip in the chat
 *              still shows it, marked as not going, because a student who pulled
 *              out needs to see what they pulled out of — and to be able to
 *              change their mind while it is still ahead of them.
 *
 *              A DISMISSED BANNER IS A DIFFERENT MATTER, and it is dropped here:
 *              putting one away is an explicit "I am finished with this", unlike
 *              a cancelled RSVP which is a statement about attendance only.
 * Version:     0.48.0
 *
 * Modifications:
 *     0.48.0 - 2026-08-19 - Cancelled sessions filtered out of the history; the
 *                           chat's ids carried so each row can link to it
 *     0.47.0 - 2026-08-19 - getMyMeetingHistory, the private list on a profile
 *     0.29.0 - 2026-08-14 - Dismissals filtered out; the strip's time window
 *                           moved to the view so the feed card keeps history
 *                           (Phase 9G)
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7)
 */

import 'server-only';

import { createClient, requireUser } from '@/lib/supabase/server';

import type { MeetingHistoryEntry, MeetingPartnerView, MeetingView } from './meeting-view';

interface MeetingRow {
  id: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string;
  created_by: string | null;
  created_at: string;
  meeting_attendees: { profile_id: string; rsvp: 'going' | 'cancelled' }[];
}

const MEETING_SELECT = `
  id,
  title,
  location,
  starts_at,
  ends_at,
  created_by,
  created_at,
  meeting_attendees ( profile_id, rsvp )
`;

/**
 * Turns a joined row into the view model, from one attendee's perspective.
 *
 * @param row      - The joined meeting row.
 * @param viewerId - Whose perspective to take.
 * @returns The view model.
 */
function toMeetingView(
  row: MeetingRow,
  viewerId: string,
  bannerDismissed: boolean,
): MeetingView {
  const mine = row.meeting_attendees.find((attendee) => attendee.profile_id === viewerId);

  return {
    id: row.id,
    title: row.title,
    location: row.location,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    going: mine?.rsvp === 'going',
    otherAttendees: row.meeting_attendees.filter(
      (attendee) => attendee.profile_id !== viewerId && attendee.rsvp === 'going',
    ).length,
    isOrganiser: row.created_by === viewerId,
    hasFinished: new Date(row.ends_at) <= new Date(),
    createdAt: row.created_at,
    bannerDismissed,
  };
}

/**
 * Every session booked from one chat, each marked with what the viewer has done.
 *
 * NO TIME WINDOW AND NO DISMISSAL FILTER HERE. Both used to live in this query,
 * which was right while the banner was the only thing reading it. The feed card
 * reads it too now, and a card is a record of something that happened in the
 * thread — it should no more expire, or vanish when a header is tidied, than the
 * messages around it. `isBannerMeeting` applies both narrowings in the strip,
 * which is the only place either belongs.
 *
 * THE DISMISSAL LOOKUP IS A SECOND QUERY rather than an embed. PostgREST's
 * `dismissed_meetings(...)` would be a left join whose emptiness we would have to
 * test client-side anyway, and RLS already narrows the table to the caller's own
 * rows — so there is nothing to filter and nothing to leak. Two indexed reads:
 * the first bounded by the chat, the second by the primary key.
 *
 * @param scope - The conversation or the group the chat belongs to.
 * @returns Meetings in chronological order.
 */
export async function getChatMeetings(scope: {
  conversationId?: string;
  groupId?: string;
}): Promise<MeetingView[]> {
  const user = await requireUser();
  const supabase = await createClient();

  let query = supabase
    .from('meetings')
    .select(MEETING_SELECT)
    .eq('status', 'scheduled')
    .order('starts_at');

  query = scope.conversationId
    ? query.eq('conversation_id', scope.conversationId)
    : query.eq('group_id', scope.groupId ?? '');

  const { data } = await query;
  const rows = (data ?? []) as unknown as MeetingRow[];

  if (rows.length === 0) {
    return [];
  }

  /* RLS already narrows this to the caller's own rows, so no profile filter. */
  const { data: dismissals } = await supabase
    .from('dismissed_meetings')
    .select('meeting_id')
    .in(
      'meeting_id',
      rows.map((row) => row.id),
    );

  const dismissed = new Set((dismissals ?? []).map((row) => row.meeting_id));

  return rows.map((row) => toMeetingView(row, user.id, dismissed.has(row.id)));
}

/**
 * The caller's own diary — every session they are going to.
 *
 * Reads rpc_my_schedule rather than the table, so "busy" means exactly what the
 * scheduler means by it: derived from meetings they are still going to, with a
 * cancelled RSVP freeing the slot the instant it is set.
 *
 * @param days - How far ahead to look.
 * @returns Their busy blocks, soonest first.
 */
export async function getMySchedule(days = 30) {
  const supabase = await createClient();

  const { data } = await supabase.rpc('rpc_my_schedule', {
    p_from: new Date().toISOString(),
    p_to: new Date(Date.now() + days * 86_400_000).toISOString(),
  });

  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/* Meeting history                                                            */
/* -------------------------------------------------------------------------- */

interface MeetingHistoryRow {
  id: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string;
  status: 'scheduled' | 'cancelled';
  created_by: string | null;
  created_at: string;
  conversation_id: string | null;
  group_id: string | null;
  meeting_attendees: {
    profile_id: string;
    rsvp: 'going' | 'cancelled';
    profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
  }[];
}

/*
 * The attendee list with the names attached, in one round trip. PostgREST
 * resolves the second hop through meeting_attendees.profile_id -> profiles.id,
 * so the alternative would be reading the ids here and then a second query per
 * page render to turn them into names.
 */
const MEETING_HISTORY_SELECT = `
  id,
  title,
  location,
  starts_at,
  ends_at,
  status,
  created_by,
  created_at,
  conversation_id,
  group_id,
  meeting_attendees ( profile_id, rsvp, profiles ( id, full_name, avatar_url ) )
`;

/**
 * Every session the caller was ever invited to, past and upcoming.
 *
 * NO SCOPE AND NO TIME WINDOW, unlike getChatMeetings — this answers "what have
 * I scheduled through StudyBuddy", which is a question about all of it, forwards
 * and backwards.
 *
 * CALLED-OFF SESSIONS ARE FILTERED OUT, and that is a different judgement from
 * the one about RSVPs. A cancelled meeting is a plan that stopped existing for
 * everybody; there is nothing to remember about it and nothing to go back to.
 * A session the student stepped out of DOES stay: it still happened, the other
 * people were there, and the row is their way back into the chat to change
 * their mind. `status` is the column that distinguishes the two.
 *
 * NOTHING IS NARROWED BY A PROFILE ID HERE, and that is the privacy guarantee.
 * The meetings policy already limits the table to rows the caller is on the
 * invitation list for, so this is the caller's own history by construction — it
 * cannot be pointed at somebody else's by passing a different id, because there
 * is no id to pass.
 *
 * @returns Their sessions, soonest first.
 */
export async function getMyMeetingHistory(): Promise<MeetingHistoryEntry[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('meetings')
    .select(MEETING_HISTORY_SELECT)
    .eq('status', 'scheduled')
    .order('starts_at');

  const rows = (data ?? []) as unknown as MeetingHistoryRow[];
  const now = new Date();

  return rows.map((row) => {
    const mine = row.meeting_attendees.find((attendee) => attendee.profile_id === user.id);

    const partners: MeetingPartnerView[] = row.meeting_attendees
      .filter((attendee) => attendee.profile_id !== user.id)
      .map((attendee) => ({
        profileId: attendee.profile_id,
        /*
         * The embed comes back null when the profiles policy will not show that
         * student to this one — someone they have since blocked, most likely.
         * The session still happened, so the row stays and the name softens.
         */
        fullName: attendee.profiles?.full_name ?? 'Classmate',
        avatarUrl: attendee.profiles?.avatar_url ?? null,
        going: attendee.rsvp === 'going',
      }));

    return {
      id: row.id,
      title: row.title,
      location: row.location,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      scope: row.group_id ? 'group' : 'direct',
      conversationId: row.conversation_id,
      groupId: row.group_id,
      partners,
      going: mine?.rsvp === 'going',
      isOrganiser: row.created_by === user.id,
      cancelled: row.status === 'cancelled',
      hasFinished: new Date(row.ends_at) <= now,
      createdAt: row.created_at,
    } satisfies MeetingHistoryEntry;
  });
}
