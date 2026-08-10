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
 *     0.15.0 - 2026-08-10 - Initial implementation (Phase 5)
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
  study_group_members ( profile_id, joined_at, profiles ( full_name, avatar_url ) )
`;

interface GroupRow {
  id: string;
  course_offering_id: string;
  name: string;
  description: string | null;
  max_participants: number;
  status: 'open' | 'closed';
  admin_id: string;
  created_at: string;
  admin: { full_name: string | null } | null;
  study_group_members: Array<{
    profile_id: string;
    joined_at: string;
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
function toRequestView(row: RequestRow): GroupRequestView {
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
  };
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
): StudyGroupView {
  const members = row.study_group_members
    .map((member) => ({
      profileId: member.profile_id,
      fullName: member.profiles?.full_name ?? 'Classmate',
      avatarUrl: member.profiles?.avatar_url ?? null,
      isAdmin: member.profile_id === row.admin_id,
    }))
    /* The admin first, then everyone else by name. */
    .sort((a, b) => Number(b.isAdmin) - Number(a.isAdmin) || a.fullName.localeCompare(b.fullName));

  return {
    id: row.id,
    courseOfferingId: row.course_offering_id,
    name: row.name,
    description: row.description,
    maxParticipants: row.max_participants,
    status: row.status,
    adminId: row.admin_id,
    adminName: row.admin?.full_name ?? 'Classmate',
    createdAt: row.created_at,
    members,
    isAdmin: row.admin_id === viewerId,
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

  const [{ data: mine }, { data: pending }] = await Promise.all([
    supabase
      .from('group_requests')
      .select('group_id, status')
      .eq('requester_id', user.id)
      .in('group_id', groupIds),
    supabase
      .from('group_requests')
      .select(REQUEST_SELECT)
      .eq('status', 'pending')
      .in('group_id', groupIds)
      .order('created_at', { ascending: true }),
  ]);

  const myStatuses = new Map<string, StudyGroupView['myRequestStatus']>();
  for (const request of mine ?? []) {
    /* A live request wins over an old rejection, which is why pending and
       approved are checked first. */
    const existing = myStatuses.get(request.group_id);
    if (!existing || request.status !== 'rejected') {
      myStatuses.set(request.group_id, request.status);
    }
  }

  const pendingByGroup = new Map<string, GroupRequestView[]>();
  for (const row of (pending ?? []) as unknown as RequestRow[]) {
    const view = toRequestView(row);
    pendingByGroup.set(view.groupId, [...(pendingByGroup.get(view.groupId) ?? []), view]);
  }

  return rows.map((row) =>
    toGroupView(row, user.id, pendingByGroup.get(row.id) ?? [], myStatuses.get(row.id) ?? null),
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
      .order('created_at', { ascending: true }),
  ]);

  return toGroupView(
    data as unknown as GroupRow,
    user.id,
    ((pending ?? []) as unknown as RequestRow[]).map(toRequestView),
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
export async function getGroupMessages(groupId: string): Promise<GroupMessageView[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('study_group_messages')
    .select('id, group_id, sender_id, body, is_system, created_at, profiles ( full_name )')
    .eq('group_id', groupId)
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
 * @returns The pending count across every group they administer.
 */
export async function getPendingRequestCount(): Promise<number> {
  const user = await requireUser();
  const supabase = await createClient();

  const { count } = await supabase
    .from('group_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .neq('requester_id', user.id);

  return count ?? 0;
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
    .neq('requester_id', user.id)
    .order('created_at', { ascending: false });

  return ((data ?? []) as unknown as RequestRow[]).map(toRequestView);
}
