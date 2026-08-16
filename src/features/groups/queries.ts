/**
 * File:        src/features/groups/queries.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Reads for the study-group screens.
 *
 *              Every query runs as the signed-in student. Discovery works because
 *              the groups policy admits anyone enrolled in the course; the member
 *              list rides along for the same reason; and the chat does not, because
 *              its policy is membership.
 * Version:     0.15.0
 *
 * Modifications:
 *     0.15.0 - 2026-08-10 - Initial implementation (Phase 5); getMyGroups for
 *                           the Groups tab
 */

import 'server-only';

import { createClient, requireUser } from '@/lib/supabase/server';

import type {
  GroupMessageView,
  GroupRequestView,
  StudyGroupView,
} from './group-view';

const GROUP_SELECT = `
  id,
  course_offering_id,
  name,
  description,
  max_participants,
  status,
  admin_id,
  created_at,
  admin:profiles!study_groups_admin_id_fkey ( full_name ),
  study_group_members ( profile_id, joined_at, role, profiles ( full_name, avatar_url ) )
`;

interface GroupRow {
  id: string;
  course_offering_id: string;
  name: string;
  description: string | null;
  max_participants: number;
  status: 'open' | 'closed';
  admin_id: string | null;
  created_at: string;
  admin: { full_name: string | null } | null;
  study_group_members: Array<{
    profile_id: string;
    joined_at: string;
    role: 'member' | 'admin';
    profiles: { full_name: string | null; avatar_url: string | null } | null;
  }>;
}

const REQUEST_SELECT = `
  id,
  group_id,
  requester_id,
  status,
  decision_note,
  created_at,
  study_groups!inner ( name ),
  requester:profiles!group_requests_requester_id_fkey (
    full_name, avatar_url, year_of_study, degrees ( name )
  )
`;

interface RequestRow {
  id: string;
  group_id: string;
  requester_id: string;
  status: 'pending' | 'approved' | 'rejected';
  decision_note: string | null;
  created_at: string;
  study_groups: { name: string } | null;
  requester: {
    full_name: string | null;
    avatar_url: string | null;
    year_of_study: number | null;
    degrees: { name: string } | null;
  } | null;
}

/**
 * Shapes a request row for the UI.
 *
 * @param row - The joined request row.
 * @returns The request as the admin's review screen consumes it.
 */
function toRequestView(row: RequestRow, groupScore: number | null = null): GroupRequestView {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: row.study_groups?.name ?? 'Study group',
    requesterId: row.requester_id,
    requesterName: row.requester?.full_name ?? 'Classmate',
    requesterAvatarUrl: row.requester?.avatar_url ?? null,
    requesterDegreeName: row.requester?.degrees?.name ?? null,
    requesterYearOfStudy: row.requester?.year_of_study ?? null,
    status: row.status,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
    groupScore,
  };
}

/**
 * How well each pending applicant fits a group, keyed by request id.
 *
 * ONE CALL FOR THE WHOLE SCREEN. The founder opens the review with every
 * pending request already listed, so scoring them from here one at a time would
 * be a round trip per row. A failure is swallowed into an empty map on purpose:
 * the number is an aid to a decision, and a review screen that will not load
 * because a score could not be computed is worse than one without the score.
 *
 * @param supabase - The caller's client.
 * @param groupId  - The group being reviewed.
 * @returns Request id to score.
 */
async function groupRequestScores(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
): Promise<Map<string, number>> {
  const { data } = await supabase.rpc('rpc_group_request_scores', { p_group_id: groupId });

  return new Map((data ?? []).map((row) => [row.request_id, Number(row.score)]));
}

/**
 * Shapes a group row from one viewer's perspective.
 *
 * @param row      - The joined group row.
 * @param viewerId - The signed-in student.
 * @param requests - Pending requests for this group; empty unless they are admin.
 * @param myStatus - The viewer's own request status, if any.
 * @returns The group as that viewer sees it.
 */
function toGroupView(
  row: GroupRow,
  viewerId: string,
  requests: GroupRequestView[],
  myStatus: StudyGroupView['myRequestStatus'],
  matchScore: number | null = null,
): StudyGroupView {
  /*
   * ADMIN COMES FROM THE MEMBERSHIP ROW, not from admin_id. Since Phase 7A a
   * group can have several admins and admin_id names only the founder — reading
   * it here would show the crown on exactly one of them.
   */
  const members = row.study_group_members
    .map((member) => ({
      profileId: member.profile_id,
      fullName: member.profiles?.full_name ?? 'Classmate',
      avatarUrl: member.profiles?.avatar_url ?? null,
      isAdmin: member.role === 'admin',
      isFounder: row.admin_id !== null && member.profile_id === row.admin_id,
    }))
    /* The founder first, then the other admins, then everyone else by name. */
    .sort(
      (a, b) =>
        Number(b.isFounder) - Number(a.isFounder) ||
        Number(b.isAdmin) - Number(a.isAdmin) ||
        a.fullName.localeCompare(b.fullName),
    );

  return {
    id: row.id,
    courseOfferingId: row.course_offering_id,
    name: row.name,
    description: row.description,
    maxParticipants: row.max_participants,
    status: row.status,
    adminId: row.admin_id,
    adminName: row.admin?.full_name ?? 'a former member',
    createdAt: row.created_at,
    members,
    matchScore,
    isAdmin: members.some((member) => member.profileId === viewerId && member.isAdmin),
    isFounder: row.admin_id !== null && row.admin_id === viewerId,
    isMember: members.some((member) => member.profileId === viewerId),
    myRequestStatus: myStatus,
    pendingRequests: requests,
  };
}

/**
 * Study groups in one course.
 *
 * Three reads rather than one: the groups, the viewer's own requests, and the
 * pending requests for groups they administer. The policies mean the third returns
 * nothing for a non-admin, so there is no branch here that could leak — the
 * database is what decides, not this code.
 *
 * @param offeringId - The course offering.
 * @returns Groups, newest first.
 */
export async function getCourseGroups(offeringId: string): Promise<StudyGroupView[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('study_groups')
    .select(GROUP_SELECT)
    .eq('course_offering_id', offeringId)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  const rows = data as unknown as GroupRow[];

  if (rows.length === 0) {
    return [];
  }

  const groupIds = rows.map((row) => row.id);

  const [{ data: mine }, { data: pending }, { data: scoreRows }] = await Promise.all([
    supabase
      .from('group_requests')
      .select('group_id, status, created_at')
      /* Newest first, so the loop below can take the first row per group and
         stop. Without this the order is whatever the heap returns. */
      .order('created_at', { ascending: false })
      .eq('requester_id', user.id)
      .in('group_id', groupIds),
    supabase
      .from('group_requests')
      .select(REQUEST_SELECT)
      .eq('status', 'pending')
      .eq('kind', 'request')
      .in('group_id', groupIds)
      .order('created_at', { ascending: true }),
    /*
     * One call for the page rather than one per card. Each score costs an
     * intersection across a group's members plus a trait comparison per member,
     * so a round trip each would be the slowest thing here.
     */
    supabase.rpc('rpc_course_group_scores', { p_course_offering_id: offeringId }),
  ]);

  /*
   * THE NEWEST REQUEST IS THE CURRENT STATE. Nothing more subtle than that.
   *
   * This used to keep whichever non-rejected row it saw last, over an unordered
   * query — which was harmless while a student could only ever have one live
   * request, and became a bug the moment they could have a finished one AND a
   * new one. Leave a group voluntarily and ask to rejoin and you hold an old
   * `approved` beside a fresh `pending`; if the approved row happened to come
   * last, the card decided they were still approved, offered "Request to join"
   * anyway, and the second press hit the live-request index and produced "you
   * have already asked" over a request the student could not see.
   *
   * getGroup has always ordered by created_at desc and taken one row. This is
   * the same rule, applied to the list the button actually lives on.
   */
  const myStatuses = new Map<string, StudyGroupView['myRequestStatus']>();
  for (const request of mine ?? []) {
    if (!myStatuses.has(request.group_id)) {
      myStatuses.set(request.group_id, request.status);
    }
  }

  const pendingByGroup = new Map<string, GroupRequestView[]>();
  for (const row of (pending ?? []) as unknown as RequestRow[]) {
    const view = toRequestView(row);
    pendingByGroup.set(view.groupId, [...(pendingByGroup.get(view.groupId) ?? []), view]);
  }

  /*
   * Absent for the groups the caller is already in — the function skips those,
   * because a member is inside the intersection the score is measured against.
   * `?? null` is the whole handling: the badge renders nothing for a null.
   */
  const scores = new Map((scoreRows ?? []).map((row) => [row.group_id, Number(row.score)]));

  return rows.map((row) =>
    toGroupView(
      row,
      user.id,
      pendingByGroup.get(row.id) ?? [],
      myStatuses.get(row.id) ?? null,
      scores.get(row.id) ?? null,
    ),
  );
}

/**
 * Every group the student belongs to, across all their courses.
 *
 * Backs the Groups tab. Reads the membership rows first and the groups second
 * rather than joining from `study_groups`: the groups policy admits every group in
 * every course they take, so a filter there would return groups they can merely
 * see, and "my groups" means the ones they are in.
 *
 * @returns Their groups, newest first.
 */
export async function getMyGroups(): Promise<StudyGroupView[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: memberships } = await supabase
    .from('study_group_members')
    .select('group_id')
    .eq('profile_id', user.id);

  const groupIds = (memberships ?? []).map((row) => row.group_id);

  if (groupIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('study_groups')
    .select(GROUP_SELECT)
    .in('id', groupIds)
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  const { data: pending } = await supabase
    .from('group_requests')
    .select(REQUEST_SELECT)
    .eq('status', 'pending')
    .eq('kind', 'request')
    .in('group_id', groupIds)
    .order('created_at', { ascending: true });

  const pendingByGroup = new Map<string, GroupRequestView[]>();
  for (const row of (pending ?? []) as unknown as RequestRow[]) {
    const view = toRequestView(row);
    pendingByGroup.set(view.groupId, [...(pendingByGroup.get(view.groupId) ?? []), view]);
  }

  return (data as unknown as GroupRow[]).map((row) =>
    /* A member's own request is 'approved' by definition — they are in the group. */
    toGroupView(row, user.id, pendingByGroup.get(row.id) ?? [], 'approved'),
  );
}

/**
 * One group, or null when the viewer cannot see it.
 *
 * @param groupId - The group to read.
 * @returns The group, or null.
 */
export async function getGroup(groupId: string): Promise<StudyGroupView | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('study_groups')
    .select(GROUP_SELECT)
    .eq('id', groupId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const [{ data: mine }, { data: pending }] = await Promise.all([
    supabase
      .from('group_requests')
      .select('status')
      .eq('requester_id', user.id)
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('group_requests')
      .select(REQUEST_SELECT)
      .eq('group_id', groupId)
      .eq('status', 'pending')
      .eq('kind', 'request')
      .order('created_at', { ascending: true }),
  ]);

  const scores = await groupRequestScores(supabase, groupId);

  return toGroupView(
    data as unknown as GroupRow,
    user.id,
    ((pending ?? []) as unknown as RequestRow[]).map((row) =>
      toRequestView(row, scores.get(row.id) ?? null),
    ),
    (mine?.[0]?.status as StudyGroupView['myRequestStatus']) ?? null,
  );
}

/**
 * One pending request, for the admin's review screen.
 *
 * @param requestId - The request to read.
 * @returns The request, or null when it is not the caller's to decide.
 */
export async function getRequest(requestId: string): Promise<GroupRequestView | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('group_requests')
    .select(REQUEST_SELECT)
    .eq('id', requestId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return toRequestView(data as unknown as RequestRow);
}

/**
 * Messages in a group's chat, oldest first.
 *
 * @param groupId - The group.
 * @returns Messages, empty when the caller is not a member.
 */
/**
 * Messages in a group's chat, oldest first.
 * Only fetches messages sent AFTER the current user joined the group.
 *
 * @param groupId - The group.
 * @returns Messages, empty when the caller is not a member.
 */
export async function getGroupMessages(groupId: string): Promise<GroupMessageView[]> {
  const user = await requireUser(); // <-- הוספנו את משיכת המשתמש הנוכחי
  const supabase = await createClient();

  // 1. קודם נבדוק מתי בדיוק המשתמש הזה הצטרף לקבוצה
  const { data: memberData, error: memberError } = await supabase
    .from('study_group_members')
    .select('joined_at')
    .eq('group_id', groupId)
    .eq('profile_id', user.id)
    .maybeSingle();

  // אם הוא לא חבר בקבוצה, נחזיר רשימה ריקה
  if (memberError || !memberData) {
    return [];
  }

  // 2. נשלוף רק את ההודעות שנשלחו אחרי או בדיוק ברגע ההצטרפות (gte = Greater Than or Equal)
  const { data, error } = await supabase
    .from('study_group_messages')
    .select('id, group_id, sender_id, body, is_system, created_at, profiles ( full_name )')
    .eq('group_id', groupId)
    .gte('created_at', memberData.joined_at) // <--- הנה סינון ההיסטוריה!
    .order('created_at', { ascending: true });

  if (error || !data) {
    return [];
  }

  return data.map((message) => ({
    id: message.id,
    groupId: message.group_id,
    senderId: message.sender_id,
    senderName: (message.profiles as { full_name: string | null } | null)?.full_name ?? null,
    body: message.body,
    isSystem: message.is_system,
    createdAt: message.created_at,
  }));
}

/**
 * How many join requests are waiting on the caller.
 *
 * The number behind the admin's notification. RLS scopes `group_requests` to rows
 * the caller sent or administers, and `status = 'pending'` plus "not mine" leaves
 * exactly the ones they have to act on.
 *
 * THE KIND FILTER IS NOT OPTIONAL since Phase 7B. An invitation is a row in this
 * same table whose requester is the student being invited — so without it, an
 * admin who invites three classmates is immediately told that three people are
 * asking to join, and clicking through finds nothing to decide.
 *
 * @returns The pending count across every group they administer.
 */
export async function getPendingRequestCount(): Promise<number> {
  const user = await requireUser();
  const supabase = await createClient();

  const { count } = await supabase
    .from('group_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .eq('kind', 'request')
    .neq('requester_id', user.id);

  return count ?? 0;
}

/**
 * Invitations waiting on the caller's own answer.
 *
 * The mirror of the count above: rows in the same table, pending, addressed to
 * them. Only they can answer one — that is the consent rule Phase 7B is built on.
 *
 * @returns Invitations, newest first.
 */
export async function getMyInvitations(): Promise<GroupRequestView[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('group_requests')
    .select(REQUEST_SELECT)
    .eq('status', 'pending')
    .eq('kind', 'invite')
    .eq('requester_id', user.id)
    .order('created_at', { ascending: false });

  return ((data ?? []) as unknown as RequestRow[]).map(toRequestView);
}

/**
 * Classmates an admin could still invite into a group.
 *
 * Everyone enrolled in the group's course, minus the members and minus anyone
 * who already has a live request or invitation — the same set the insert policy
 * will accept, worked out here so the list never offers a name that then fails.
 *
 * @param groupId - The group being staffed.
 * @returns Classmates who could be asked, by name.
 */
/**
 * Classmates an admin could still invite into a group.
 *
 * Everyone enrolled in the group's course, minus anyone
 * who already has a live pending request or invitation.
 * Members are included so the UI can tag them as "Already in the group".
 *
 * @param groupId - The group being staffed.
 * @returns Classmates who could be asked, by name.
 */
export async function getInvitableClassmates(
  groupId: string,
): Promise<Array<{ profileId: string; fullName: string; avatarUrl: string | null }>> {
  const supabase = await createClient();

  const { data: group } = await supabase
    .from('study_groups')
    .select('course_offering_id, study_group_members ( profile_id )')
    .eq('id', groupId)
    .maybeSingle();

  if (!group) {
    return [];
  }

  // NOTE: Changed to only exclude 'pending' status, removing 'approved'
  const { data: live } = await supabase
    .from('group_requests')
    .select('requester_id')
    .eq('group_id', groupId)
    .eq('status', 'pending')
    .eq('kind', 'invite');

  // NOTE: Removed current members from the 'taken' Set
  const taken = new Set<string>([
    ...(live ?? []).map((row) => row.requester_id),
  ]);

  const { data: classmates } = await supabase
    .from('enrollments')
    .select('profile_id, profiles ( full_name, avatar_url, is_discoverable )')
    .eq('course_offering_id', group.course_offering_id);

  return ((classmates ?? []) as unknown as Array<{
    profile_id: string;
    profiles: { full_name: string | null; avatar_url: string | null } | null;
  }>)
    .filter((row) => !taken.has(row.profile_id) && row.profiles !== null)
    .map((row) => ({
      profileId: row.profile_id,
      fullName: row.profiles?.full_name ?? 'Classmate',
      avatarUrl: row.profiles?.avatar_url ?? null,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/**
 * Every pending request across the caller's groups, newest first.
 *
 * @returns Requests awaiting their decision.
 */
export async function getMyPendingRequests(): Promise<GroupRequestView[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from('group_requests')
    .select(REQUEST_SELECT)
    .eq('status', 'pending')
    /* Requests only. An invitation lives in this table too, and its requester is
       the student being invited — see getPendingRequestCount. */
    .eq('kind', 'request')
    .neq('requester_id', user.id)
    .order('created_at', { ascending: false });

  const rows = (data ?? []) as unknown as RequestRow[];

  /*
   * One score call per GROUP, not per request. These requests span every group
   * the caller administers, and rpc_group_request_scores already answers for a
   * whole group at once — so the number of round trips is the number of groups
   * with somebody waiting, which is small and does not grow with the queue.
   */
  const groupIds = [...new Set(rows.map((row) => row.group_id))];
  const scoreMaps = await Promise.all(
    groupIds.map((groupId) => groupRequestScores(supabase, groupId)),
  );

  const scores = new Map(scoreMaps.flatMap((map) => [...map]));

  return rows.map((row) => toRequestView(row, scores.get(row.id) ?? null));
}
