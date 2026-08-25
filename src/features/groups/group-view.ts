 /**
 * File:        src/features/groups/group-view.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The shape of a study group as the UI consumes it, the canned
 *              rejection reasons, and the pure logic around capacity.
 *
 *              "Full" lives here rather than in the database, because it is a
 *              count against a limit and not a state anyone sets. Storing it would
 *              be a second copy of a number `study_group_members` already knows,
 *              free to drift the moment somebody leaves.
 *
 *              Kept out of queries.ts because that module is `server-only` and the
 *              rejection modal is a client component.
 * Version:     0.15.0
 *
 * Modifications:
 *     0.15.0 - 2026-08-10 - Initial implementation (Phase 5)
 */

export interface GroupMemberView {
  profileId: string;
  fullName: string;
  avatarUrl: string | null;
  /** Any admin, of which a group may have several since Phase 7A. */
  isAdmin: boolean;
  /** The one who created it. Cannot be demoted, and alone may demote. */
  isFounder: boolean;
}

export interface GroupRequestView {
  id: string;
  groupId: string;
  groupName: string;
  requesterId: string;
  requesterName: string;
  requesterAvatarUrl: string | null;
  requesterDegreeName: string | null;
  requesterYearOfStudy: number | null;
  status: 'pending' | 'approved' | 'rejected';
  decisionNote: string | null;
  createdAt: string;
  /**
   * How well they fit THE GROUP, 0-100, or null when it could not be worked out.
   *
   * Not the founder's own compatibility with them: a candidate can match the
   * founder perfectly and still be free at no hour the group actually meets,
   * which is the case this number exists to surface. Null rather than 0 when
   * absent — "we do not know" and "they fit badly" must not render the same.
   */
  groupScore: number | null;
}

export interface StudyGroupView {
  id: string;
  courseOfferingId: string;
  name: string;
  description: string | null;
  maxParticipants: number;
  status: 'open' | 'closed';
  /** The founder. Null once their account is deleted. */
  adminId: string | null;
  adminName: string;
  createdAt: string;
  members: GroupMemberView[];
  /** True when the viewer administers this group — one of possibly several. */
  isAdmin: boolean;
  /** True when the viewer created it. The rank that may demote. */
  isFounder: boolean;
  /** True when the viewer is in it, admin included. */
  isMember: boolean;
  /** The viewer's own live request, when they have one. */
  myRequestStatus: 'pending' | 'approved' | 'rejected' | null;
  /** Pending requests, and only ever populated for the admin. */
  pendingRequests: GroupRequestView[];
  /**
   * How well the VIEWER fits this group, 0-100, or null.
   *
   * Null on the groups they are already in, deliberately: the score measures a
   * candidate against the hours the members share, and a member is part of what
   * makes those hours — the number would be measuring them against a week they
   * themselves helped define. Null also where the list was loaded without
   * scores, which is every surface but the course page.
   */
  matchScore: number | null;
}

export interface GroupMessageView {
  id: string;
  groupId: string;
  senderId: string | null;
  senderName: string | null;
  body: string;
  /** True for a "Welcome X to the group!" line, which the UI renders as an event. */
  isSystem: boolean;
  createdAt: string;
}

/** Smallest and largest a group may be; mirrors the CHECK on max_participants. */
export const MIN_PARTICIPANTS = 2;
export const MAX_PARTICIPANTS = 20;

/**
 * The polite rejections offered in the modal.
 *
 * Canned rather than free text by default, and that is the point: the alternative
 * is an admin typing something in a hurry to a classmate they will sit next to all
 * semester. `other` exists because a fixed list cannot cover every reason, and
 * forcing one of four would put words in their mouth.
 */
export const REJECTION_REASONS = [
  {
    value: 'group_full',
    label: 'The group is full',
    message:
      'Thanks for asking to join! The group is full at the moment, but I will keep you in mind if a space opens up.',
  },
  {
    value: 'remote_only',
    label: 'We are meeting in person / remote only',
    message:
      'Thanks for asking to join! We have settled on a way of meeting that does not match what you are after, so I do not think it would work well for you.',
  },
  {
    value: 'different_times',
    label: 'Our times do not overlap',
    message:
      'Thanks for asking to join! Our sessions are at times that do not seem to line up with yours, so it would be hard to make it work.',
  },
  {
    value: 'different_pace',
    label: 'We are working at a different pace',
    message:
      'Thanks for asking to join! We are working through the material at a pace that may not suit what you need right now.',
  },
  {
    value: 'other',
    label: 'Something else (write your own)',
    message: '',
  },
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number]['value'];

/**
 * The message text for a chosen reason.
 *
 * @param reason - The selected reason.
 * @param custom - Free text, used only when the reason is 'other'.
 * @returns The message to send, trimmed.
 */
export function rejectionMessageFor(reason: string, custom: string): string {
  if (reason === 'other') {
    return custom.trim();
  }

  return REJECTION_REASONS.find((option) => option.value === reason)?.message.trim() ?? '';
}

/**
 * How many places are left in a group.
 *
 * @param group - The group.
 * @returns Remaining places, never negative.
 */
export function placesLeft(group: Pick<StudyGroupView, 'maxParticipants' | 'members'>): number {
  return Math.max(0, group.maxParticipants - group.members.length);
}

/**
 * Whether a group has no room left.
 *
 * @param group - The group.
 * @returns True when it is at capacity.
 */
export function isFull(group: Pick<StudyGroupView, 'maxParticipants' | 'members'>): boolean {
  return placesLeft(group) === 0;
}

/**
 * Whether the viewer may ask to join.
 *
 * Four reasons they may not, and the UI shows the specific one — "Group is full"
 * and "You already asked" are different situations and a single disabled button
 * would explain neither.
 *
 * @param group - The group as the viewer sees it.
 * @returns True when a request is possible.
 */
export function canRequestToJoin(group: StudyGroupView): boolean {
  return (
    !group.isMember &&
    group.status === 'open' &&
    !isFull(group) &&
    group.myRequestStatus !== 'pending'
  );
}

/**
 * Why the viewer cannot ask to join, in words.
 *
 * @param group - The group as the viewer sees it.
 * @returns A short reason, or null when they can ask.
 */
export function joinBlockedReason(group: StudyGroupView): string | null {
  if (group.isFounder) {
    return 'You created this group';
  }

  /* Checked before isAdmin, which is now a rank rather than authorship: an admin
     who was promoted did not create the group, and being told they did would be
     a small lie in a place students look to understand what happened. */
  if (group.isMember) {
    return 'You are in this group';
  }

  if (group.myRequestStatus === 'pending') {
    return 'Waiting for the admin to reply';
  }

  if (group.status === 'closed') {
    return 'Not accepting requests';
  }

  if (isFull(group)) {
    return 'Full';
  }

  return null;
}

/**
 * The welcome line posted to the chat when someone is accepted.
 *
 * One place, so the wording cannot differ between the action and its test.
 *
 * @param fullName - The new member's name.
 * @returns The system message body.
 */
export function welcomeMessageFor(fullName: string): string {
  return `Welcome ${fullName.trim() || 'a new member'} to the group!`;
}