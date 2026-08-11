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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { inviteToGroup } from '@/features/groups/actions';

/** How many names to show before asking them to narrow it down. */
const VISIBLE_LIMIT = 6;

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
  const [invited, setInvited] = useState<InvitePanelProps['classmates']>([]);
  const [pendingFor, setPendingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [, startTransition] = useTransition();

  const invite = (classmate: InvitePanelProps['classmates'][number]) => {
    setError(null);
    setPendingFor(classmate.profileId);

    startTransition(async () => {
      const result = await inviteToGroup({ groupId, profileId: classmate.profileId });

      setPendingFor(null);

      if (result.ok) {
        setInvited((current) => [...current, classmate]);
      } else {
        setError(result.error.message);
      }
    });
  };

  /*
   * THE INVITED PERSON HAS TO STAY ON SCREEN, and keeping them is not cosmetic.
   * Inviting revalidates this page, and the server then correctly leaves them
   * out of `classmates` — they now have a live request, so they are no longer
   * someone who can be invited. Rendering only the prop would make the row
   * vanish at the moment of clicking, which reads as "nothing happened" for the
   * one action in this panel that needs to feel like it did.
   */
  const listed = [
    ...classmates,
    ...invited.filter(
      (person) => !classmates.some((classmate) => classmate.profileId === person.profileId),
    ),
  ].sort((a, b) => a.fullName.localeCompare(b.fullName));

  /*
   * A LECTURE COURSE HAS HUNDREDS OF PEOPLE IN IT, and an admin inviting someone
   * has a specific person in mind — they are not browsing. So the list is capped
   * until they type, and anyone they have already asked stays pinned regardless
   * of the filter, because losing the confirmation to a search term would undo
   * the point of keeping it on screen at all.
   */
  const matching = query.trim()
    ? listed.filter((person) => person.fullName.toLowerCase().includes(query.trim().toLowerCase()))
    : listed;

  const visible = [
    ...matching.slice(0, VISIBLE_LIMIT),
    ...invited.filter((person) => !matching.slice(0, VISIBLE_LIMIT).some((p) => p.profileId === person.profileId)),
  ];

  const hidden = matching.length - Math.min(matching.length, VISIBLE_LIMIT);

  if (listed.length === 0) {
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

      <div className="mb-4 flex flex-col gap-2">
        <Label htmlFor="invite-search">Find a classmate</Label>
        <Input
          id="invite-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Start typing a name"
          autoComplete="off"
        />
      </div>

      {error ? (
        <p role="alert" className="text-destructive mb-3 flex items-start gap-2 text-label-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <ul aria-label="Classmates you can invite" className="flex flex-col gap-3">
        {visible.map((classmate) => {
          const asked = invited.some(
            (person) => person.profileId === classmate.profileId,
          );

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
                  onClick={() => invite(classmate)}
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

      {hidden > 0 ? (
        <p className="text-outline mt-3 text-label-sm font-normal">
          {hidden} more {hidden === 1 ? 'classmate' : 'classmates'} take this course — type a
          name to find them.
        </p>
      ) : null}

      {matching.length === 0 ? (
        <p className="text-outline mt-3 text-label-sm font-normal">
          Nobody taking this course matches “{query}”.
        </p>
      ) : null}

      {placesLeft === 0 ? (
        <p className="text-outline mt-3 text-label-sm font-normal">
          The group is full. Raise the limit in settings to invite anyone else.
        </p>
      ) : null}
    </>
  );
}
