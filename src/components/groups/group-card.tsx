/**
 * File:        src/components/groups/group-card.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: One study group on a course page: who is in it, how much room is
 *              left, and the one action available to this viewer.
 * Version:     0.15.1
 *
 * Modifications:
 *     0.15.0 - 2026-08-10 - Initial implementation (Phase 5)
 *     0.15.1 - 2026-08-11 - Added router refresh on join request success
 */

'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, Crown, Loader2, MessagesSquare, UserPlus, Users } from 'lucide-react';

import { GroupFitBadge } from '@/components/groups/group-fit-badge';
import { MatchAvatar } from '@/components/matching/match-avatar';
import { Chip } from '@/components/ui/chip';
import { requestToJoin } from '@/features/groups/actions';
import {
  canRequestToJoin,
  joinBlockedReason,
  placesLeft,
  type StudyGroupView,
} from '@/features/groups/group-view';

export interface GroupCardProps {
  group: StudyGroupView;
}

/**
 * Renders one study-group card.
 *
 * @param group - The group as this viewer sees it.
 * @returns The list item element.
 */
export function GroupCard({ group }: GroupCardProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(requestToJoin, null);

  useEffect(() => {
    if (state && state.ok) {
      router.refresh();
    }
  }, [state, router]);

  const error = state && !state.ok ? state.error : null;
  const left = placesLeft(group);
  const blocked = joinBlockedReason(group);

  return (
    /* `relative`, so the fit badge can sit in the corner the way MatchCard's
       score does. */
    <li className="clay-card relative flex flex-col p-5">
      {/*
        * Top corner, as on a student's match card — and never beside the Admin
        * chip, because the two are mutually exclusive: matchScore is null for
        * groups the viewer is in, which is the only time that chip shows.
        */}
      <GroupFitBadge
        score={group.matchScore}
        subject="group"
        className="absolute top-4 right-4"
      />

      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-heading text-[17px] leading-snug text-balance">{group.name}</h4>
          <p className="text-outline mt-0.5 text-label-sm font-normal">
            Run by {group.isAdmin ? 'you' : group.adminName}
          </p>
        </div>

        {group.isAdmin ? (
          <Chip tone="brand">
            <Crown className="size-3" aria-hidden="true" />
            Admin
          </Chip>
        ) : null}
      </div>

      {group.description ? (
        <p className="text-on-surface-variant mb-3 text-body-md text-pretty">
          {group.description}
        </p>
      ) : null}

      <ul aria-label="Members" className="mb-3 flex flex-wrap items-center gap-1.5">
        {group.members.slice(0, 6).map((member) => (
          <li key={member.profileId} title={member.fullName}>
            <MatchAvatar
              fullName={member.fullName}
              avatarUrl={member.avatarUrl}
              size={28}
              className="border-2"
            />
          </li>
        ))}
        {group.members.length > 6 ? (
          <li className="text-outline text-label-sm font-normal">
            +{group.members.length - 6}
          </li>
        ) : null}
      </ul>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip tone={left === 0 ? 'neutral' : 'mint'}>
          <Users className="size-3" aria-hidden="true" />
          {group.members.length} of {group.maxParticipants}
          {left > 0 ? ` · ${left} free` : ' · full'}
        </Chip>

        {group.status === 'closed' ? <Chip tone="neutral">Closed</Chip> : null}

        {group.isAdmin && group.pendingRequests.length > 0 ? (
          <Chip tone="sunset">
            {group.pendingRequests.length}{' '}
            {group.pendingRequests.length === 1 ? 'request' : 'requests'} waiting
          </Chip>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-destructive mb-2 flex items-start gap-2 text-label-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error.message}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {group.isMember ? (
          <Link
            href={`/groups/${group.id}`}
            className="clay-btn-primary focus-visible:ring-brand/35 flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-label-md focus-visible:ring-4 focus-visible:outline-none"
          >
            <MessagesSquare className="size-4" aria-hidden="true" />
            {group.isAdmin && group.pendingRequests.length > 0 ? 'Open and review' : 'Open group'}
          </Link>
        ) : canRequestToJoin(group) ? (
          <form action={formAction} className="flex-1">
            <input type="hidden" name="groupId" value={group.id} />
            <button
              type="submit"
              disabled={pending}
              className="clay-btn-secondary focus-visible:ring-brand/35 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-label-md focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserPlus className="size-4" aria-hidden="true" />
              )}
              Request to join
            </button>
          </form>
        ) : (
          <p className="text-outline flex-1 text-center text-label-sm font-normal">
            {blocked ?? 'Not available'}
          </p>
        )}
      </div>
    </li>
  );
}