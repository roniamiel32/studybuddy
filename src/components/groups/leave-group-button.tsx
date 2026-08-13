/**
 * File:        src/components/groups/leave-group-button.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Leave group", for the members who are not its founder.
 *
 *              THE ACTION HAS EXISTED SINCE PHASE 5 and so has the policy that
 *              permits it — "you can leave, or be removed by an admin". What was
 *              missing was any way to press it, so leaving meant asking the admin
 *              to remove you. This is the button.
 *
 *              CONFIRMED IN PLACE, NOT IN A DIALOG. Leaving is undoable — you can
 *              ask to join again — so a modal would be heavier than the act. It
 *              is also not nothing: the group's chat history goes out of reach,
 *              because getGroupMessages shows a member only what was said after
 *              they joined. Two presses is the right price.
 *
 *              THE FOUNDER NEVER SEES IT. check_group_member_removal refuses to
 *              delete them, so rendering the button for a founder would be
 *              offering a control the database will decline. The group page
 *              decides, from `isFounder`.
 * Version:     0.28.0
 *
 * Modifications:
 *     0.28.0 - 2026-08-13 - Initial implementation (Phase 9F)
 */

'use client';

import { useActionState, useState } from 'react';
import { AlertCircle, Check, Loader2, LogOut, X } from 'lucide-react';

import { leaveGroup } from '@/features/groups/actions';

export interface LeaveGroupButtonProps {
  groupId: string;
  groupName: string;
}

/**
 * Renders the leave control and its inline confirmation.
 *
 * @param groupId   - The group to leave.
 * @param groupName - Named in the confirmation, so it is clear which one.
 * @returns The control element.
 */
export function LeaveGroupButton({ groupId, groupName }: LeaveGroupButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [state, formAction, pending] = useActionState(leaveGroup, null);

  const error = state && !state.ok ? state.error : null;


  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-on-surface-variant hover:text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/35 flex items-center gap-2 rounded-md px-3 py-2 text-label-md transition-colors focus-visible:ring-4 focus-visible:outline-none"
      >
        <LogOut className="size-4" aria-hidden="true" />
        Leave group
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="groupId" value={groupId} />

      <p className="text-on-surface-variant text-label-sm font-normal text-pretty">
        Leave {groupName}? You will lose access to its chat, and you would have to ask
        to join again.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-destructive focus-visible:ring-destructive/35 flex items-center gap-2 rounded-md px-3 py-2 text-label-md text-white transition-colors hover:brightness-110 focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="size-4" aria-hidden="true" />
          )}
          Yes, leave
        </button>

        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="text-on-surface-variant hover:bg-surface-container focus-visible:ring-brand/35 flex items-center gap-2 rounded-md px-3 py-2 text-label-md transition-colors focus-visible:ring-4 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
          Cancel
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="text-destructive flex items-start gap-2 text-label-sm font-normal"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error.message}
        </p>
      ) : null}
    </form>
  );
}
