/**
 * File:        src/features/calendar/write-sync.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Write sync — a study session the student is going to becomes a
 *              busy block in their Google Calendar, and stops being one when
 *              they step out or the session is called off.
 *
 *              NOTHING IN HERE MAY FAIL A MEETING ACTION. Every entry point
 *              swallows its own errors and returns void. RSVPing is the
 *              product; mirroring it into Google is a convenience, and a student
 *              whose token expired last week must still be able to say they are
 *              coming. Failures are logged and left for the next sync to correct.
 *
 *              `calendar_event_links` is what makes removal possible. Without a
 *              stored event id, un-RSVPing would mean searching somebody's
 *              calendar for something that looks like ours and hoping.
 * Version:     0.48.0
 *
 * Modifications:
 *     0.48.0 - 2026-08-19 - The event title is built per recipient, so each
 *                           student's calendar names the other one
 *     0.47.0 - 2026-08-19 - The event carries the meeting's own title, unprefixed
 *     0.46.0 - 2026-08-18 - Initial implementation (two-way calendar sync)
 */

import 'server-only';

import { loadUsableConnection } from '@/features/calendar/connection';
import {
  isDefaultMeetingTitle,
  sessionTitleWithPartner,
} from '@/features/meetings/meeting-view';
import { createEvent, deleteEvent } from '@/lib/google/calendar';
import { createAdminClient } from '@/lib/supabase/admin';

/** What the calendar event needs to say. */
interface MeetingForCalendar {
  id: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  /** Set for a group session, null for a one-to-one. */
  groupId: string | null;
}

/**
 * Reads the meeting fields the calendar needs.
 *
 * Admin client because this runs on behalf of several attendees at once when a
 * meeting is cancelled, and the caller is only one of them.
 *
 * @param meetingId - The meeting to read.
 * @returns Its calendar-relevant fields, or null.
 */
async function readMeeting(meetingId: string): Promise<MeetingForCalendar | null> {
  const { data } = await createAdminClient()
    .from('meetings')
    .select('id, title, location, starts_at, ends_at, group_id')
    .eq('id', meetingId)
    .maybeSingle();

  return data
    ? {
        id: data.id,
        title: data.title,
        location: data.location,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
        groupId: data.group_id,
      }
    : null;
}

/**
 * The title one student's calendar should show for a session.
 *
 * THE STORED TITLE NAMES ONE SIDE OF THE PAIR, AND THAT IS THE PROBLEM THIS
 * SOLVES. "Study session with Paula Partner" is the right sentence in Eden's
 * calendar and precisely the wrong one in Paula's, where it reads as a session
 * she booked with herself. There is one row and two readers, so the row cannot
 * be right for both — the title is therefore rewritten as it goes out, per
 * recipient, and the database keeps the organiser's version untouched.
 *
 * TWO CASES ARE LEFT ALONE, both deliberately:
 *
 *   A TITLE A STUDENT TYPED. "Past papers" is something the organiser chose to
 *   record; replacing it with a name would throw that away. Only the titles this
 *   app generated are eligible, which is what isDefaultMeetingTitle decides.
 *
 *   A GROUP SESSION. Its default is already the group's name, which reads
 *   correctly for every member — and rewriting it into a list of the other four
 *   people would be worse for all of them.
 *
 * @param meeting   - The session, as stored.
 * @param profileId - Whose calendar this event is going into.
 * @returns The title to send to Google.
 */
async function titleForRecipient(
  meeting: MeetingForCalendar,
  profileId: string,
): Promise<string> {
  if (meeting.groupId || !isDefaultMeetingTitle(meeting.title)) {
    return meeting.title;
  }

  /* Admin client: this runs on behalf of the OTHER attendee as often as the
     caller, and one student's session must not be invisible to the other's sync. */
  const { data } = await createAdminClient()
    .from('meeting_attendees')
    .select('profile_id, profiles ( full_name )')
    .eq('meeting_id', meeting.id)
    .neq('profile_id', profileId);

  const other = (data ?? [])[0] as
    | { profile_id: string; profiles: { full_name: string | null } | null }
    | undefined;

  const name = other?.profiles?.full_name ?? null;

  /* No readable partner — a deleted account, most likely. The stored title is
     still a true sentence about the session, so it goes across unchanged. */
  return name ? sessionTitleWithPartner(name) : meeting.title;
}

/**
 * Writes one meeting into one student's calendar, if they have one connected.
 *
 * Idempotent: a link row already present means the event exists and nothing is
 * written twice. RSVPing "going" twice is a normal thing for a person to do.
 *
 * @param profileId - Whose calendar.
 * @param meetingId - Which meeting.
 * @returns Nothing. Failures are logged, never thrown.
 */
export async function pushMeetingToCalendar(
  profileId: string,
  meetingId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from('calendar_event_links')
      .select('google_event_id')
      .eq('meeting_id', meetingId)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (existing) {
      return;
    }

    const connection = await loadUsableConnection(profileId);

    if (!connection) {
      return;
    }

    const meeting = await readMeeting(meetingId);

    if (!meeting) {
      return;
    }

    /*
     * NO "StudyBuddy: " PREFIX. It pushed the part that identifies the session —
     * "Study session with Dana Levi" — past the width a calendar grid gives a
     * two-hour block, so a week of them read as a column of identical entries.
     * The description below still says where it came from, which is the job the
     * prefix was actually doing.
     */
    const created = await createEvent(connection.accessToken, {
      title: await titleForRecipient(meeting, profileId),
      description: 'Booked through StudyBuddy.',
      location: meeting.location,
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
    });

    if (!created.ok) {
      console.error('[calendar.writeSync] creating the event failed:', created.reason);
      return;
    }

    /*
     * Inserted after the event exists, so the table never claims an event that
     * Google does not have. The other order would leave a link pointing at
     * nothing, and a later delete would silently do nothing.
     */
    const { error: linkError } = await admin.from('calendar_event_links').upsert(
      {
        meeting_id: meetingId,
        profile_id: profileId,
        google_event_id: created.data,
      },
      { onConflict: 'meeting_id,profile_id', ignoreDuplicates: true },
    );

    if (linkError) {
      /*
       * The event exists in Google but we failed to write down its id, so nothing
       * can ever remove it. Logged loudly: it is the one failure in this file
       * that leaves the two sides genuinely out of step.
       */
      console.error(
        '[calendar.writeSync] event created but the link could not be stored:',
        linkError.message,
      );
    }
  } catch (error) {
    console.error('[calendar.writeSync] push threw:', error);
  }
}

/**
 * Removes one meeting from one student's calendar.
 *
 * The link row is deleted whenever Google has stopped holding the event —
 * including when it was already gone, which the client reports as success. A
 * link that outlived its event would block a later re-RSVP from writing a new one.
 *
 * @param profileId - Whose calendar.
 * @param meetingId - Which meeting.
 * @returns Nothing. Failures are logged, never thrown.
 */
export async function removeMeetingFromCalendar(
  profileId: string,
  meetingId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: link } = await admin
      .from('calendar_event_links')
      .select('google_event_id')
      .eq('meeting_id', meetingId)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (!link) {
      return;
    }

    const connection = await loadUsableConnection(profileId);

    if (!connection) {
      /*
       * No usable token: the event cannot be removed now. The link row STAYS, so
       * a reconnect can still clean it up rather than the app forgetting the
       * event exists.
       */
      return;
    }

    const removed = await deleteEvent(connection.accessToken, link.google_event_id);

    if (!removed.ok) {
      console.error('[calendar.writeSync] deleting the event failed:', removed.reason);
      return;
    }

    await admin
      .from('calendar_event_links')
      .delete()
      .eq('meeting_id', meetingId)
      .eq('profile_id', profileId);
  } catch (error) {
    console.error('[calendar.writeSync] remove threw:', error);
  }
}

/**
 * Removes a cancelled meeting from every attendee's calendar.
 *
 * Driven off the link table rather than the attendee list: the students who need
 * an event removed are exactly the ones who had one written, which is not the
 * same set as the ones going — somebody may have connected their calendar after
 * the meeting was booked, or stepped out already.
 *
 * @param meetingId - The meeting being called off.
 * @returns Nothing. Failures are logged, never thrown.
 */
export async function removeMeetingFromAllCalendars(meetingId: string): Promise<void> {
  try {
    const { data: links } = await createAdminClient()
      .from('calendar_event_links')
      .select('profile_id')
      .eq('meeting_id', meetingId);

    /* Sequential on purpose. A group session is a handful of people, and firing
       every delete at Google at once is how a shared quota gets rate-limited. */
    for (const link of links ?? []) {
      await removeMeetingFromCalendar(link.profile_id, meetingId);
    }
  } catch (error) {
    console.error('[calendar.writeSync] fan-out threw:', error);
  }
}

/**
 * Brings one student's Google Calendar in line with what they are actually going to.
 *
 * Idempotent, and the self-healing half of the write sync. It exists because the
 * per-action hooks cannot cover every path: a student may connect their calendar
 * a week after booking three sessions, or a create RPC may book several meetings
 * at once without handing back their ids. Reconciling against the current state
 * covers all of it without needing to know which event triggered the run.
 *
 * Scoped to sessions that have not started. Rewriting the past would add calendar
 * entries for study sessions that already happened.
 *
 * @param profileId - Whose calendar to reconcile.
 * @returns Nothing. Failures are logged, never thrown.
 */
export async function syncUpcomingMeetings(profileId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const [{ data: attending }, { data: links }] = await Promise.all([
      admin
        .from('meeting_attendees')
        .select('meeting_id, rsvp, meetings!inner(id, status, starts_at)')
        .eq('profile_id', profileId)
        .eq('rsvp', 'going')
        .eq('meetings.status', 'scheduled')
        .gte('meetings.starts_at', now),
      admin.from('calendar_event_links').select('meeting_id').eq('profile_id', profileId),
    ]);

    const shouldHave = new Set((attending ?? []).map((row) => row.meeting_id));
    const alreadyHas = new Set((links ?? []).map((row) => row.meeting_id));

    /* Sequential: a student has a handful of sessions, and a burst of parallel
       calls at Google is how a shared quota gets rate-limited. */
    for (const meetingId of shouldHave) {
      if (!alreadyHas.has(meetingId)) {
        await pushMeetingToCalendar(profileId, meetingId);
      }
    }

    for (const meetingId of alreadyHas) {
      if (!shouldHave.has(meetingId)) {
        await removeMeetingFromCalendar(profileId, meetingId);
      }
    }
  } catch (error) {
    console.error('[calendar.writeSync] reconcile threw:', error);
  }
}
