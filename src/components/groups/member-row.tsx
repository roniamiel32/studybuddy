/**
 * File:        src/components/groups/member-row.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: One member of a study group, with whatever the viewer may do
 *              about them.
 *
 *              THE TWO RANKS, SHOWN RATHER THAN EXPLAINED. Any admin may promote;
 *              only the founder may demote or remove another admin; the founder
 *              can be neither. The controls follow those rules exactly, so an
 *              admin never presses something the database is going to refuse —
 *              and the database refuses it anyway, because a hidden button is a
 *              courtesy and not a permission.
 *
 *              The founder's crown is filled and an admin's is outlined. One rank
 *              can grant the other, so drawing them identically would make
 *              "why can I not demote them?" unanswerable from the screen.
 * Version:     0.19.1
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7A)
 *     0.19.1 - 2026-08-11 - Added inline confirmation for member removal
 */

'use client';
import Link from 'next/link';

import { useState, useTransition } from 'react';
import { AlertCircle, Crown, Loader2, Shield, UserMinus, Check, X } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { Chip } from '@/components/ui/chip';
import { removeMember, setMemberRole } from '@/features/groups/actions';
import type { GroupMemberView } from '@/features/groups/group-view';

export interface MemberRowProps {
  groupId: string;
  member: GroupMemberView;
  viewerId: string;
  /** Whether the viewer administers the group. */
  viewerIsAdmin: boolean;
  /** Whether the viewer founded it — the rank that may demote and evict admins. */
  viewerIsFounder: boolean;
}

/**
 * Renders one member.
 *
 * @param props - The member, and who is looking at them.
 * @returns The list item.
 */
export function MemberRow({
  groupId,
  member,
  viewerId,
  viewerIsAdmin,
  viewerIsFounder,
}: MemberRowProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  
  // הסטייט החדש שמנהל את תצוגת האישור
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);

  const isSelf = member.profileId === viewerId;

  const act = (run: () => Promise<{ ok: boolean; error?: { message: string } }>) => {
    setError(null);

    startTransition(async () => {
      const result = await run();

      if (!result.ok && result.error) {
        setError(result.error.message);
      }
    });
  };

  /* The founder's rank is not a decision anyone gets to make, including theirs. */
  const canPromote = viewerIsAdmin && !member.isAdmin;
  const canDemote = viewerIsFounder && member.isAdmin && !member.isFounder;
  const canRemove =
    !member.isFounder && !isSelf && (member.isAdmin ? viewerIsFounder : viewerIsAdmin);

  return (
   <li className="flex flex-wrap items-center justify-between gap-y-2">
      {/* 1. הקישור לעמוד הפרופיל: עוטף רק את התמונה והשם */}
      <Link 
        href={`/students/${member.profileId}`} 
        className="flex flex-1 min-w-0 items-center gap-3 rounded-md p-1.5 transition-colors hover:bg-surface-container-low"
      >
        <MatchAvatar
          fullName={member.fullName}
          avatarUrl={member.avatarUrl}
          size={36}
          className="border-2"
        />
        <span className="truncate text-label-md">
          {isSelf ? 'You' : member.fullName}
        </span>
      </Link>

      {/* 2. התיוגים והכפתורים: יושבים בחוץ ולא לחיצים כחלק מהקישור */}
      <div className="flex shrink-0 items-center gap-3 pl-2">
        {member.isFounder ? (
          <Chip tone="brand">
            <Crown className="size-3" aria-hidden="true" />
            Founder
          </Chip>
        ) : member.isAdmin ? (
          <Chip tone="mint">
            <Shield className="size-3" aria-hidden="true" />
            Admin
          </Chip>
        ) : null}

        {canPromote || canDemote || canRemove ? (
          <span className="flex items-center gap-2">
            {pending ? (
              <Loader2 className="text-outline size-3.5 animate-spin" aria-hidden="true" />
            ) : null}

            {canPromote ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  act(() => setMemberRole({ groupId, profileId: member.profileId, role: 'admin' }))
                }
                className="text-on-surface-variant hover:text-brand focus-visible:ring-brand/35 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
              >
                Make admin
              </button>
            ) : null}

            {canDemote ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  act(() => setMemberRole({ groupId, profileId: member.profileId, role: 'member' }))
                }
                className="text-on-surface-variant hover:text-brand focus-visible:ring-brand/35 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
              >
                Remove admin
              </button>
            ) : null}

            {canRemove ? (
              isConfirmingRemove ? (
                <span className="flex items-center gap-1.5 ml-1">
                  <span className="text-label-sm text-outline pr-1">Remove?</span>
                  <button
                    type="button"
                    onClick={() => {
                      act(() => removeMember({ groupId, profileId: member.profileId }));
                      setIsConfirmingRemove(false);
                    }}
                    className="text-red-500 hover:text-red-700 transition-colors focus-visible:outline-none p-1"
                    aria-label="Confirm removal"
                  >
                    <Check className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsConfirmingRemove(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors focus-visible:outline-none p-1"
                    aria-label="Cancel removal"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setIsConfirmingRemove(true)}
                  aria-label={`Remove ${member.fullName} from the group`}
                  className="text-outline hover:text-destructive focus-visible:ring-brand/35 rounded-md p-1 transition-colors focus-visible:ring-4 focus-visible:outline-none disabled:opacity-60"
                >
                  <UserMinus className="size-4" aria-hidden="true" />
                </button>
              )
            ) : null}
          </span>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="text-destructive flex w-full items-start gap-2 text-label-sm mt-1"
        >
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
    </li>
  );
}