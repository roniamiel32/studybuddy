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
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7)
 */

import 'server-only';

import { createClient, requireUser } from '@/lib/supabase/server';

import type { MeetingView } from './meeting-view';

interface MeetingRow {
  id: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string;
  created_by: string | null;
  meeting_attendees: { profile_id: string; rsvp: 'going' | 'cancelled' }[];
}

const MEETING_SELECT = `
  id,
  title,
  location,
  starts_at,
  ends_at,
  created_by,
  meeting_attendees ( profile_id, rsvp )
`;

/**
 * Turns a joined row into the view model, from one attendee's perspective.
 *
 * @param row      - The joined meeting row.
 * @param viewerId - Whose perspective to take.
 * @returns The view model.
 */
function toMeetingView(row: MeetingRow, viewerId: string): MeetingView {
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
  };
}

/**
 * Sessions booked from one chat, from the last day and every one still ahead.
 *
 * The backward window is what lets the chat offer rating right after a session
 * rather than only until it starts: a meeting that finished an hour ago is the
 * one people most want to say something about.
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

  const since = new Date(Date.now() - 86_400_000).toISOString();

  let query = supabase
    .from('meetings')
    .select(MEETING_SELECT)
    .eq('status', 'scheduled')
    .gte('ends_at', since)
    .order('starts_at');

  query = scope.conversationId
    ? query.eq('conversation_id', scope.conversationId)
    : query.eq('group_id', scope.groupId ?? '');

  const { data } = await query;

  return ((data ?? []) as unknown as MeetingRow[]).map((row) => toMeetingView(row, user.id));
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
