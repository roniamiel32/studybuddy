/**
 * File:        src/components/groups/invite-panel.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Invite a classmate" — the admin's side of adding someone.
 *
 *              THE COPY DOES THE HONEST WORK. This does not add anyone; it asks.
 *              Phase 5 refused to let an admin put a student into a group chat
 *              without their say-so, and Phase 7B kept that promise by making an
 *              invitation a request in the other direction. An admin who thinks
 *              they have added someone and then finds them absent would conclude
 *              the app is broken, so the button says "Invite" and the state after
 *              it says "Invited — waiting for them".
 *
 *              The list is the set the insert policy will actually accept:
 *              classmates in the course, minus members, minus anyone with a live
 *              request or invitation. Offering a name that then fails would be
 *              the same lie in a different place.
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7B)
 */

'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, Check, Loader2, UserPlus } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { inviteToGroup } from '@/features/groups/actions';

export interface InvitePanelProps {
  groupId: string;
  classmates: Array<{ profileId: string; fullName: string; avatarUrl: string | null }>;
  /** Whether there is room. A full group cannot take another invitation. */
  placesLeft: number;
}

/**
 * Renders the invitation list.
 *
 * @param props - The group, who could be asked, and whether there is room.
 * @returns The section element.
 */
export function InvitePanel({ groupId, classmates, placesLeft }: InvitePanelProps) {
  const [invited, setInvited] = useState<string[]>([]);
  const [pendingFor, setPendingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const invite = (profileId: string) => {
    setError(null);
    setPendingFor(profileId);

    startTransition(async () => {
      const result = await inviteToGroup({ groupId, profileId });

      setPendingFor(null);

      if (result.ok) {
        setInvited((current) => [...current, profileId]);
      } else {
        setError(result.error.message);
      }
    });
  };

  if (classmates.length === 0) {
    return (
      <p className="text-on-surface-variant mt-2 text-body-md text-pretty">
        Everyone taking this course is either in the group already or has been asked.
      </p>
    );
  }

  return (
    <>
      <p className="text-on-surface-variant mt-1 mb-4 text-body-md text-pretty">
        They decide whether to join — an invitation is a request in the other direction.
      </p>

      {error ? (
        <p role="alert" className="text-destructive mb-3 flex items-start gap-2 text-label-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <ul aria-label="Classmates you can invite" className="flex flex-col gap-3">
        {classmates.map((classmate) => {
          const asked = invited.includes(classmate.profileId);

          return (
            <li key={classmate.profileId} className="flex items-center gap-3">
              <MatchAvatar
                fullName={classmate.fullName}
                avatarUrl={classmate.avatarUrl}
                size={32}
                className="border-2"
              />

              <span className="min-w-0 flex-1 truncate text-label-md">
                {classmate.fullName}
              </span>

              {asked ? (
                <span className="text-brand flex items-center gap-1.5 text-label-sm">
                  <Check className="size-4" aria-hidden="true" />
                  Invited — waiting for them
                </span>
              ) : (
                <button
                  type="button"
                  disabled={pendingFor !== null || placesLeft === 0}
                  onClick={() => invite(classmate.profileId)}
                  className="text-on-surface-variant hover:text-brand focus-visible:ring-brand/35 flex items-center gap-1.5 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
                >
                  {pendingFor === classmate.profileId ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <UserPlus className="size-4" aria-hidden="true" />
                  )}
                  Invite
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {placesLeft === 0 ? (
        <p className="text-outline mt-3 text-label-sm font-normal">
          The group is full. Raise the limit in settings to invite anyone else.
        </p>
      ) : null}
    </>
  );
}
