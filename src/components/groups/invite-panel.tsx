/**
 * File:        src/components/groups/invite-panel.tsx
 * Authors:     Roni Amiel & Eden Bitran
 */

'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, Check, Loader2, UserPlus, X } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { decideRequest, inviteToGroup } from '@/features/groups/actions';

const VISIBLE_LIMIT = 6;

export interface InvitePanelProps {
  groupId: string;
  classmates: Array<{ profileId: string; fullName: string; avatarUrl: string | null }>;
  members: Array<{ profileId: string; fullName: string; avatarUrl: string | null }>;
  requests: Array<{ id: string; requesterId: string }>;
  placesLeft: number;
}

export function InvitePanel({
  groupId,
  classmates,
  members,
  requests,
  placesLeft,
}: InvitePanelProps) {
  const [invited, setInvited] = useState<InvitePanelProps['classmates']>([]);
  const [pendingFor, setPendingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [, startTransition] = useTransition();

  // 1. פונקציה להזמנת סטודנט לקבוצה
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

  // 2. פונקציה לאישור (V) או דחייה (X) של מי שביקש להצטרף
  const handleDecision = (requestId: string, decision: 'approved' | 'rejected') => {
    setError(null);
    setPendingFor(requestId);

    startTransition(async () => {
      const formData = new FormData();
      formData.append('requestId', requestId);
      formData.append('decision', decision);
      
      // אם דחינו את הבקשה, השרת דורש לדעת למה
      if (decision === 'rejected') {
        formData.append('reason', 'other');
        formData.append('customMessage', 'The admin declined the request from the search panel.');
      }

      const result = await decideRequest(null, formData);
      setPendingFor(null);
      
      if (result && !result.ok) {
        setError(result.error.message);
      }
    });
  };

  const listed = [
    ...classmates,
    ...invited.filter(
      (person) => !classmates.some((classmate) => classmate.profileId === person.profileId),
    ),
  ].sort((a, b) => a.fullName.localeCompare(b.fullName));

  // הרשימה תהיה ריקה עד שתקלידי משהו בחיפוש
  const matching = query.trim()
    ? listed.filter((person) => person.fullName.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  const visible = [
    ...matching.slice(0, VISIBLE_LIMIT),
    ...invited.filter((person) => !matching.slice(0, VISIBLE_LIMIT).some((p) => p.profileId === person.profileId)),
  ];

  const hidden = matching.length - Math.min(matching.length, VISIBLE_LIMIT);

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
          const isAlreadyMember = members.some(
            (member) => member.profileId === classmate.profileId,
          );

          const pendingRequest = requests.find(
            (req) => req.requesterId === classmate.profileId,
          );

          const asked = invited.some(
            (person) => person.profileId === classmate.profileId,
          );

          const isProcessing =
            pendingFor === classmate.profileId ||
            (pendingRequest && pendingFor === pendingRequest.id);

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

              {/* בדיקה 1: האם כבר בקבוצה? */}
              {isAlreadyMember ? (
                <span className="text-outline text-label-sm">
                  Already in the group
                </span>
              
              /* בדיקה 2: האם ביקש להצטרף? אם כן -> מציגים V ו-X */
              ) : pendingRequest ? (
                <div className="flex items-center gap-1">
                  <span className="text-brand mr-1 text-label-sm font-medium">
                    Wants to join
                  </span>

                  {isProcessing ? (
                    <Loader2 className="size-4 animate-spin text-brand" aria-hidden="true" />
                  ) : (
                    <>
                      <button
                        type="button"
                        title="Approve request"
                        disabled={pendingFor !== null}
                        onClick={() => handleDecision(pendingRequest.id, 'approved')}
                        className="text-brand hover:bg-brand/10 rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 disabled:opacity-50"
                      >
                        <Check className="size-4" aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        title="Reject request"
                        disabled={pendingFor !== null}
                        onClick={() => handleDecision(pendingRequest.id, 'rejected')}
                        className="text-destructive hover:bg-destructive/10 rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/35 disabled:opacity-50"
                      >
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              
              /* בדיקה 3: האם אנחנו כבר הזמנו אותו? */
              ) : asked ? (
                <span className="text-brand flex items-center gap-1.5 text-label-sm">
                  <Check className="size-4" aria-hidden="true" />
                  Invited — waiting for them
                </span>
              
              /* בדיקה 4: סטודנט רגיל -> כפתור הזמנה */
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

      {matching.length === 0 && query.trim() ? (
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