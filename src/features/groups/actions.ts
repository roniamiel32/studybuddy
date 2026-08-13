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
import { createClient as createAdminClient } from '@supabase/supabase-js';
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

    // מנסים להכניס בקשה חדשה רגילה
    const { error: insertError } = await supabase.from('group_requests').insert({
      group_id: groupId,
      requester_id: user.id,
      status: 'pending',
    });

    // אם ההכנסה נכשלה עקב אילוץ כפילות (קוד שגיאה 23505)
    if (insertError) {
      if (insertError.code === '23505') {
        const adminSupabase = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // מחיקת הבקשה הישנה באמצעות הרשאת אדמין עוקפת RLS
        const { error: deleteError } = await adminSupabase
          .from('group_requests')
          .delete()
          .eq('group_id', groupId)
          .eq('requester_id', user.id);

        if (deleteError) {
          console.error('❌ Failed to clear old request:', deleteError);
          return fail(ERROR_CODES.FORBIDDEN, 'We could not update your request.', 'groupId');
        }

        // יצירת הבקשה החדשה מחדש
        const { error: retryError } = await supabase.from('group_requests').insert({
          group_id: groupId,
          requester_id: user.id,
          status: 'pending',
        });

        if (retryError) {
          console.error('❌ Failed to retry request:', retryError);
          return fail(ERROR_CODES.FORBIDDEN, 'We could not send that request.', 'groupId');
        }
      } else {
        console.error('❌ Unexpected request error:', insertError);
        return fail(
          ERROR_CODES.FORBIDDEN,
          'We could not send that request. The group may no longer be open.',
          'groupId',
        );
      }
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

      try {
        const adminSupabase = createAdminClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { error: notifErr } = await adminSupabase.from('notifications').insert({
          recipient_id: request.requester_id,
          actor_id: user.id,
          type: 'group_invite',
          group_id: request.group_id,
        } as any);

        if (notifErr) {
          console.error('❌ Failed to create notification:', notifErr);
        }
      } catch (err) {
        console.error('❌ Exception while creating notification:', err);
      }

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
