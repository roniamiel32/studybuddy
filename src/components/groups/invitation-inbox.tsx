/**
 * File:        src/components/groups/invitation-inbox.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Invitations waiting on the student's own answer.
 *
 *              The other end of the consent rule. An admin has asked them into a
 *              group; nobody else can answer for them, so this is the only place
 *              the join can happen — which is why it sits at the top of the
 *              Groups page rather than somewhere they might not look.
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7B)
 */

'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, Loader2, Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { decideInvitation } from '@/features/groups/actions';
import type { GroupRequestView } from '@/features/groups/group-view';

export interface InvitationInboxProps {
  invitations: GroupRequestView[];
}

/**
 * Renders the pending invitations.
 *
 * @param invitations - Invitations addressed to the viewer.
 * @returns The section, or null when there are none.
 */
export function InvitationInbox({ invitations }: InvitationInboxProps) {
  if (invitations.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="invitations-heading" className="clay-card mb-6 p-5">
      <h2 id="invitations-heading" className="font-heading text-headline-md flex items-center gap-2">
        <Mail className="text-brand size-5" aria-hidden="true" />
        You have been invited
      </h2>
      <p className="text-on-surface-variant mt-1 mb-4 text-body-md text-pretty">
        Joining is your call — nobody can accept these for you.
      </p>

      <ul aria-label="Group invitations" className="flex flex-col gap-3">
        {invitations.map((invitation) => (
          <InvitationRow key={invitation.id} invitation={invitation} />
        ))}
      </ul>
    </section>
  );
}

/**
 * One invitation, with its two answers.
 *
 * @param invitation - The invitation.
 * @returns The list item.
 */
function InvitationRow({ invitation }: { invitation: GroupRequestView }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const answer = (accept: boolean) => {
    setError(null);

    startTransition(async () => {
      const result = await decideInvitation({ requestId: invitation.id, accept });

      if (!result.ok) {
        setError(result.error.message);
      }
    });
  };

  return (
    <li className="border-outline-variant/50 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border p-3">
      <p className="min-w-0 flex-1 text-label-md">
        {invitation.groupName}
        <span className="text-outline block text-label-sm font-normal">
          Invited by an admin of this group
        </span>
      </p>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => answer(true)}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Join
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => answer(false)}
        >
          No thanks
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-destructive flex w-full items-start gap-2 text-label-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </li>
  );
}
