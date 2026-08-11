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

import { ERROR_CODES, fail, ok, toActionError, type ActionResult } from '@/lib/errors';
import { createClient, requireUser } from '@/lib/supabase/server';

import { rejectionMessageFor } from './group-view';
import {
  createGroupSchema,
  decideRequestSchema,
  groupMessageSchema,
  requestToJoinSchema,
} from './schema';

/**
 * Creates a study group and makes the caller its admin.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `courseOfferingId`, `name`, `description`, `maxParticipants`.
 * @returns Success, or a failure the form can display.
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
      /* The policy and the consistency trigger both refuse a course the student
         does not take, which is the only likely cause here. */
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
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `groupId`.
 * @returns Success, or a failure.
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

    const { error } = await supabase.from('group_requests').insert({
      group_id: groupId,
      requester_id: user.id,
      status: 'pending',
    });

    if (error) {
      /*
       * 23505 is the one-live-request index. Not an error worth alarming anyone
       * about — they have already asked, which is exactly what they wanted.
       */
      if (error.code === '23505') {
        return ok(undefined);
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
    /* The admin's badge lives in the layout. */
    revalidatePath('/', 'layout');

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'groups.requestToJoin');
  }
}

/**
 * Approves or rejects a join request.
 *
 * Approval goes through the RPC, which does the three writes in one transaction.
 * Rejection is two writes that can safely be separate: the decision, then the
 * message telling them. If the message fails the rejection still stands, and the
 * result says so rather than pretending it was sent.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `requestId`, `decision`, and for a rejection a
 *                   `reason` plus optional `customMessage`.
 * @returns Success, or a failure the modal can display.
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

    /* Read before deciding, so the redirect and the message have what they need. */
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
        /* The capacity trigger is the likely cause, and it is worth naming: the
           admin is looking at a request for a group that just filled up. */
        return fail(
          ERROR_CODES.CONFLICT,
          'We could not add them. The group may already be full.',
          'decision',
        );
      }
    } else {
      const body = rejectionMessageFor(input.reason ?? '', input.customMessage ?? '');

      if (!body) {
        return fail(ERROR_CODES.VALIDATION_FAILED, 'Choose a reason so we can tell them.', 'reason');
      }

      const { error } = await supabase
        .from('group_requests')
        .update({
          status: 'rejected',
          decided_at: new Date().toISOString(),
          decided_by: user.id,
          /* Kept on the row as well as sent, so the group's history says what was
             said rather than only that a rejection happened. */
          decision_note: body,
        })
        .eq('id', input.requestId);

      if (error) {
        return fail(ERROR_CODES.FORBIDDEN, 'That request is not yours to decide.');
      }

      const sent = await sendRejectionMessage(supabase, user.id, request.requester_id, body);

      if (!sent) {
        /*
         * Reported rather than swallowed. The request IS rejected, and the student
         * would otherwise be left with a request that vanished and no explanation
         * — the exact thing the canned messages exist to prevent.
         */
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
 *
 * Reuses Phase 3's conversations, which is the point: the student gets a real
 * message in the place they already read messages, from the person who made the
 * decision, rather than a notification that leads nowhere. It is attributed to the
 * admin because they chose it — the text is canned, the decision was theirs.
 *
 * @param supabase    - The caller's client, so RLS applies to both writes.
 * @param adminId     - The admin sending it.
 * @param requesterId - The student being told.
 * @param body        - The message.
 * @returns True when the message was stored.
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
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `groupId` and `body`.
 * @returns Success, or a failure the composer can display.
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
      /* Never true from here: the policy refuses it, and only the approval RPC
         writes system messages. */
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
 *
 * The admin cannot use this: the delete policy excludes them, because leaving would
 * orphan the group. Handing a group over is a feature nobody has asked for.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `groupId`.
 * @returns Success, or a failure.
 */
export async function leaveGroup(
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

    return ok(undefined);
  } catch (error) {
    return toActionError(error, 'groups.leaveGroup');
  }
}

/**
 * Opens or closes a group to new requests.
 *
 * @param previous - Prior result, required by useActionState and unused.
 * @param formData - Carries `groupId` and `status`.
 * @returns Success, or a failure.
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
