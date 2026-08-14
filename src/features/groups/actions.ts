/**
 * File:        src/features/groups/actions.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The write side of study groups: creating one, asking to join,
 *              deciding a request, posting to the group chat, and leaving.
 *
 *              Everything runs as the signed-in student so the Phase 5 policies do
 *              the authorisation. The one exception is approval, which goes through
 *              `rpc_approve_group_request` because it has to be atomic — see the
 *              comment on that function.
 * Version:     0.15.0
 *
 * Modifications:
 *     0.15.0 - 2026-08-10 - Initial implementation (Phase 5)
 */

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
/* No service-role client here any more. Both uses of it were routing around a
   policy rather than satisfying one — see requestToJoin and decideRequest. */
import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { createClient, requireUser } from '@/lib/supabase/server';

import { rejectionMessageFor } from './group-view';
import {
  createGroupSchema,
  decideInvitationSchema,
  decideRequestSchema,
  groupMessageSchema,
  inviteToGroupSchema,
  markGroupReadSchema,
  memberRoleSchema,
  removeMemberSchema,
  requestToJoinSchema,
  updateGroupSchema,
} from './schema';

/**
 * Creates a study group and makes the caller its admin.
 */
export async function createGroup(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const input = createGroupSchema.parse({
      courseOfferingId: String(formData.get('courseOfferingId') ?? ''),
      name: String(formData.get('name') ?? ''),
      description: String(formData.get('description') ?? ''),
      maxParticipants: String(formData.get('maxParticipants') ?? ''),
    });

    const { data: profile } = await supabase
      .from('profiles')
      .select('university_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile) {
      return fail(ERROR_CODES.ONBOARDING_INCOMPLETE, 'Finish setting up your profile first.');
    }

    const { error } = await supabase.from('study_groups').insert({
      course_offering_id: input.courseOfferingId,
      university_id: profile.university_id,
      admin_id: user.id,
      name: input.name,
      description: input.description ? input.description : null,
      max_participants: input.maxParticipants,
    });

    if (error) {
      return fail(
        ERROR_CODES.FORBIDDEN,
        'We could not create that group. You need to be enrolled in the course.',
        'name',
      );
    }

    revalidatePath(`/courses/${input.courseOfferingId}`);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'groups.createGroup');
  }
}

/**
 * Asks to join a group.
 *
 * A PLAIN INSERT, AND NOTHING ELSE. There is no upsert here and no delete,
 * because the schema already says everything this needs:
 *
 *   - `group_requests_one_live_per_student_idx` is a PARTIAL unique index over
 *     (group_id, requester_id) `where status in ('pending', 'approved')`. A
 *     rejected row is outside it, so somebody who was turned down — or who left
 *     and came back — simply inserts a new row with a new id and a new
 *     created_at. Nothing has to be cleared out of the way first.
 *   - So a 23505 here means exactly one thing: they already have a request
 *     waiting, or they are already in. Both are answers to give them, not
 *     conflicts to resolve.
 *
 * THIS REPLACED A DELETE-AND-REINSERT, and that is the fix for the flooded
 * notification feed. The old version caught 23505, opened a SERVICE-ROLE client,
 * deleted every group_requests row for the pair — decided ones included — and
 * inserted a fresh pending one. Three consequences, all of them bad:
 *
 *   1. It destroyed the history. `freeze_group_request` exempts service_role and
 *      `authenticated` has no DELETE grant, so the admin client was routing
 *      around both of the protections that exist to stop precisely this.
 *   2. Every repeat click re-fired `notify_group_request`, and unlike the
 *      derived notification types, group_request has no partial unique index to
 *      collapse onto — one row per insert, forever.
 *   3. The feed matches a group_request notification to a live request by
 *      (actor, group), so all of those duplicates matched the single pending row
 *      and each drew its own review card. Reproduced: three extra clicks turned
 *      1 request and 2 notifications into 1 request, 0 history and 5
 *      notifications.
 */
export async function requestToJoin(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const { groupId } = requestToJoinSchema.parse({
      groupId: String(formData.get('groupId') ?? ''),
    });

    const { data: group } = await supabase
      .from('study_groups')
      .select('course_offering_id')
      .eq('id', groupId)
      .maybeSingle();

    const { error: insertError } = await supabase.from('group_requests').insert({
      group_id: groupId,
      requester_id: user.id,
      status: 'pending',
    });

    if (insertError) {
      /*
       * The partial index. Distinguished from a policy refusal because the two
       * need different sentences: this one is "you already did that", which is
       * reassurance, and the other is "you cannot", which is not.
       */
      if (insertError.code === '23505') {
        const { data: member } = await supabase
          .from('study_group_members')
          .select('group_id')
          .eq('group_id', groupId)
          .eq('profile_id', user.id)
          .maybeSingle();

        return fail(
          ERROR_CODES.CONFLICT,
          member
            ? 'You are already in this group.'
            : 'You have already asked to join this group. The admin has not answered yet.',
          'groupId',
        );
      }

      return fail(
        ERROR_CODES.FORBIDDEN,
        'We could not send that request. The group may no longer be open.',
        'groupId',
      );
    }

    if (group) {
      revalidatePath(`/courses/${group.course_offering_id}`);
    }
    revalidatePath('/', 'layout');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'groups.requestToJoin');
  }
}
/**
 * Approves or rejects a join request.
 */
export async function decideRequest(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const input = decideRequestSchema.parse({
      requestId: String(formData.get('requestId') ?? ''),
      decision: String(formData.get('decision') ?? ''),
      reason: formData.get('reason') ? String(formData.get('reason')) : undefined,
      customMessage: formData.get('customMessage')
        ? String(formData.get('customMessage'))
        : undefined,
    });

    const { data: request } = await supabase
      .from('group_requests')
      .select('id, group_id, requester_id, study_groups!inner ( course_offering_id, name )')
      .eq('id', input.requestId)
      .maybeSingle();

    if (!request) {
      return fail(ERROR_CODES.NOT_FOUND, 'That request is no longer available.');
    }

    const offeringId = request.study_groups?.course_offering_id;

    if (input.decision === 'approved') {
      const { error } = await supabase.rpc('rpc_approve_group_request', {
        p_request_id: input.requestId,
      });

      if (error) {
        return fail(
          ERROR_CODES.CONFLICT,
          'We could not add them. The group may already be full.',
          'decision',
        );
      }

      /*
       * NO NOTIFICATION IS WRITTEN HERE, deliberately.
       *
       * There used to be one: a service-role insert of a `group_invite` row to
       * tell the student they were approved. It went out through the admin
       * client because `notifications` has no INSERT policy at all — which is
       * the schema saying "application code does not write this table", not an
       * obstacle to route around. A feed the client can write to is a feed that
       * can lie, so every row in it is written by a trigger from the event that
       * actually happened.
       *
       * It was also mistyped. `group_invite` means "somebody invited you to a
       * group", and the copy the feed renders for it says so; an approval
       * arriving under that type told the student they had been invited to a
       * group they had asked to join and were already a member of.
       *
       * rpc_approve_group_request adds them to study_group_members, and the
       * welcome message posted to the group chat is what announces it. If a
       * dedicated "you were approved" notification is wanted, it belongs in a
       * trigger on that membership insert, beside the others.
       */
    } else {
      const body = rejectionMessageFor(input.reason ?? '', input.customMessage ?? '');

      if (!body) {
        return fail(ERROR_CODES.VALIDATION_FAILED, 'Choose a reason so we can tell them.', 'reason');
      }

      const { error } = await supabase.rpc('rpc_reject_group_request', {
        p_request_id: input.requestId,
        p_note: body,
      });

      if (error) {
        return fail(
          ERROR_CODES.FORBIDDEN,
          error.message.includes('already been decided')
            ? 'Another admin has already answered this one.'
            : 'That request is not yours to decide.',
        );
      }

      const sent = await sendRejectionMessage(supabase, user.id, request.requester_id, body);

      if (!sent) {
        return fail(
          ERROR_CODES.UNEXPECTED,
          'Request rejected, but we could not send them the message. You may want to write to them directly.',
        );
      }
    }

    if (offeringId) {
      revalidatePath(`/courses/${offeringId}`);
    }
    revalidatePath('/messages');
    revalidatePath('/', 'layout');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'groups.decideRequest');
  }
}

/**
 * Sends the rejection as an ordinary one-to-one message.
 */
async function sendRejectionMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminId: string,
  requesterId: string,
  body: string,
): Promise<boolean> {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .or(
      `and(participant_a.eq.${adminId},participant_b.eq.${requesterId}),` +
        `and(participant_a.eq.${requesterId},participant_b.eq.${adminId})`,
    )
    .maybeSingle();

  let conversationId = existing?.id ?? null;

  if (!conversationId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('university_id')
      .eq('id', adminId)
      .maybeSingle();

    if (!profile) {
      return false;
    }

    const { data: created, error } = await supabase
      .from('conversations')
      .insert({
        participant_a: adminId,
        participant_b: requesterId,
        university_id: profile.university_id,
      })
      .select('id')
      .single();

    if (error || !created) {
      return false;
    }

    conversationId = created.id;
  }

  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    sender_id: adminId,
    body,
  });

  return !error;
}

/**
 * Posts a message to a group's chat.
 */
export async function postGroupMessage(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const input = groupMessageSchema.parse({
      groupId: String(formData.get('groupId') ?? ''),
      body: String(formData.get('body') ?? ''),
    });

    const { error } = await supabase.from('study_group_messages').insert({
      group_id: input.groupId,
      sender_id: user.id,
      body: input.body,
      is_system: false,
    });

    if (error) {
      return fail(
        ERROR_CODES.FORBIDDEN,
        'We could not post that. You may no longer be in this group.',
        'body',
      );
    }

    revalidatePath(`/groups/${input.groupId}`);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'groups.postGroupMessage');
  }
}

/**
 * Leaves a group.
 */
export async function leaveGroup(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  let left = false;

  try {
    const user = await requireUser();
    const supabase = await createClient();

    const { groupId } = requestToJoinSchema.parse({
      groupId: String(formData.get('groupId') ?? ''),
    });

    const { data: group } = await supabase
      .from('study_groups')
      .select('course_offering_id, admin_id')
      .eq('id', groupId)
      .maybeSingle();

    if (group?.admin_id === user.id) {
      return fail(
        ERROR_CODES.VALIDATION_FAILED,
        'You created this group, so you cannot leave it. Close it instead.',
      );
    }

    const { data, error } = await supabase
      .from('study_group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('profile_id', user.id)
      .select('profile_id');

    if (error || (data ?? []).length === 0) {
      return fail(ERROR_CODES.FORBIDDEN, 'We could not remove you from that group.');
    }

    if (group) {
      revalidatePath(`/courses/${group.course_offering_id}`);
    }

    /* The group was a row in Messages and its unread fed the nav badge, so both
       the list and the shell are stale the moment the membership goes. */
    revalidatePath('/messages');
    revalidatePath('/', 'layout');

    left = true;
  } catch (error) {
    return toActionError(error, 'groups.leaveGroup');
  }

  /*
   * REDIRECTED FROM HERE, NOT FROM AN EFFECT IN THE BUTTON.
   *
   * The page this is submitted from 404s the instant the membership row goes —
   * getGroup returns null for a non-member — and `revalidatePath` above makes
   * that re-render part of the same response. A `router.replace` in the client
   * lost the race: the not-found page had already replaced the component, so the
   * effect that was supposed to navigate never ran and the student was left
   * looking at the group they had just left.
   *
   * Outside the try, because redirect() works by throwing and toActionError
   * would otherwise catch it and report "something went wrong".
   */
  if (left) {
    redirect('/messages');
  }

  return ok(undefined);
}

/**
 * Opens or closes a group to new requests.
 */
export async function setGroupStatus(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    const supabase = await createClient();

    const { groupId } = requestToJoinSchema.parse({
      groupId: String(formData.get('groupId') ?? ''),
    });
    const status = String(formData.get('status') ?? '');

    if (status !== 'open' && status !== 'closed') {
      return fail(ERROR_CODES.VALIDATION_FAILED, 'That is not a valid status.');
    }

    const { data, error } = await supabase
      .from('study_groups')
      .update({ status })
      .eq('id', groupId)
      .select('course_offering_id');

    if (error || (data ?? []).length === 0) {
      return fail(ERROR_CODES.FORBIDDEN, 'Only the group admin can change this.');
    }

    revalidatePath(`/courses/${data![0].course_offering_id}`);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'groups.setGroupStatus');
  }
}

/**
 * Edits a group's name, blurb and participant limit.
 */
export async function updateGroup(
  previous: ActionResult<void> | null,
  formData: FormData,
): Promise<ActionResult<void>> {
  try {
    await requireUser();
    const supabase = await createClient();

    const input = updateGroupSchema.parse({
      groupId: String(formData.get('groupId') ?? ''),
      name: String(formData.get('name') ?? ''),
      description: String(formData.get('description') ?? ''),
      maxParticipants: String(formData.get('maxParticipants') ?? ''),
    });

    const { data, error } = await supabase
      .from('study_groups')
      .update({
        name: input.name,
        description: input.description ? input.description : null,
        max_participants: input.maxParticipants,
      })
      .eq('id', input.groupId)
      .select('course_offering_id');

    if (error) {
      if (error.message.includes('already has')) {
        return fail(ERROR_CODES.VALIDATION_FAILED, error.message, 'maxParticipants');
      }

      return fail(ERROR_CODES.FORBIDDEN, 'We could not save those changes.', 'name');
    }

    if ((data ?? []).length === 0) {
      return fail(ERROR_CODES.FORBIDDEN, 'Only an admin can edit this group.', 'name');
    }

    revalidatePath(`/groups/${input.groupId}`);
    revalidatePath(`/courses/${data![0].course_offering_id}`);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'groups.updateGroup');
  }
}

/**
 * Promotes a member to admin, or demotes one back.
 */
export async function setMemberRole(input: {
  groupId: string;
  profileId: string;
  role: 'member' | 'admin';
}): Promise<ActionResult<void>> {
  try {
    await requireUser();
    const parsed = memberRoleSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('study_group_members')
      .update({ role: parsed.role })
      .eq('group_id', parsed.groupId)
      .eq('profile_id', parsed.profileId)
      .select('profile_id');

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, error.message);
    }

    if ((data ?? []).length === 0) {
      return fail(ERROR_CODES.FORBIDDEN, 'Only an admin can change who runs this group.');
    }

    revalidatePath(`/groups/${parsed.groupId}`);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'groups.setMemberRole');
  }
}

/**
 * Removes someone from a group, or leaves it.
 */
export async function removeMember(input: {
  groupId: string;
  profileId: string;
}): Promise<ActionResult<void>> {
  try {
    await requireUser();
    const parsed = removeMemberSchema.parse(input);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('study_group_members')
      .delete()
      .eq('group_id', parsed.groupId)
      .eq('profile_id', parsed.profileId)
      .select('profile_id');

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, error.message);
    }

    if ((data ?? []).length === 0) {
      return fail(ERROR_CODES.FORBIDDEN, 'That is not yours to do.');
    }

    revalidatePath(`/groups/${parsed.groupId}`);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'groups.removeMember');
  }
}

/**
 * Invites a classmate into the group.
 */
export async function inviteToGroup(input: {
  groupId: string;
  profileId: string;
}): Promise<ActionResult<void>> {
  try {
    const user = await requireUser();
    const parsed = inviteToGroupSchema.parse(input);
    const supabase = await createClient();

    const { error } = await supabase.from('group_requests').insert({
      group_id: parsed.groupId,
      requester_id: parsed.profileId,
      kind: 'invite',
      invited_by: user.id,
      status: 'pending',
    });

    if (error) {
      return fail(ERROR_CODES.FORBIDDEN, 'We could not send that invitation. One might already exist.');
    }

    revalidatePath(`/groups/${parsed.groupId}`);

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'groups.inviteToGroup');
  }
}

/**
 * Accepts or declines an invitation addressed to the caller.
 */
export async function decideInvitation(input: {
  requestId: string;
  accept: boolean;
}): Promise<ActionResult<void>> {
  try {
    await requireUser();
    const parsed = decideInvitationSchema.parse(input);
    const supabase = await createClient();

    const { error } = parsed.accept
      ? await supabase.rpc('rpc_approve_group_request', { p_request_id: parsed.requestId })
      : await supabase.rpc('rpc_reject_group_request', { p_request_id: parsed.requestId });

    if (error) {
      if (error.message.includes('full')) {
        return fail(ERROR_CODES.VALIDATION_FAILED, 'That group filled up before you answered.');
      }

      return fail(ERROR_CODES.FORBIDDEN, 'That invitation is no longer yours to answer.');
    }

    revalidatePath('/groups', 'layout');
    revalidatePath('/courses', 'layout');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'groups.decideInvitation');
  }
}
/**
 * Records that the caller has just opened a group chat.
 *
 * WHAT MAKES THE BADGE CLEAR. Group unread is counted as "messages from other
 * people, sent after I last looked" — so looking is the whole of the write, and
 * `last_seen_at` is the only column it touches.
 *
 * THROUGH AN RPC RATHER THAN AN UPDATE, and the reason is a privilege
 * escalation: `study_group_members` has one UPDATE policy and it is admin-only.
 * Opening that up so a member could stamp their own row would also let them set
 * their own role to admin, because check_group_role_change restricts demotion
 * rather than promotion. rpc_mark_group_read writes one column for auth.uid()
 * and nothing else.
 *
 * SILENT ON FAILURE, on purpose. This fires from an effect when a chat opens; a
 * student who is mid-conversation should not be shown an error about
 * bookkeeping they did not ask for, and the next visit will stamp it anyway.
 *
 * @param groupId - The group being opened.
 * @returns Success, or a failure the caller is free to ignore.
 */
export async function markGroupRead(groupId: string): Promise<ActionResult<void>> {
  try {
    await requireUser();
    const supabase = await createClient();

    const parsed = markGroupReadSchema.parse(groupId);

    const { error } = await supabase.rpc('rpc_mark_group_read', {
      target_group_id: parsed,
    });

    if (error) {
      return fail(ERROR_CODES.UNEXPECTED, 'We could not update this group.');
    }

    /* The badge lives in the layout, so the whole app shell has to re-render —
       the same reason markConversationRead revalidates the layout. */
    revalidatePath('/', 'layout');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'groups.markGroupRead');
  }
}
