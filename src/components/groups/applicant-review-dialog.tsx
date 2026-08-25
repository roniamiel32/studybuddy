/**
 * File:        src/components/groups/applicant-review-dialog.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Reviewing one applicant: their profile, with Accept and Reject on
 *              it, and the rejection reasons behind Reject.
 *
 *              TWO STEPS IN ONE DIALOG. Accept is one press, because it is the
 *              friendly outcome and nothing has to be explained. Reject opens a
 *              second step asking what to tell them — the canned lines exist
 *              because the alternative is an admin typing something in a hurry to
 *              a classmate they will sit beside all semester, and "Other" exists
 *              because four options cannot cover every reason.
 *
 *              A native <dialog>, so focus trapping, Escape and the backdrop come
 *              from the platform rather than from effects and a keydown handler.
 * Version:     0.15.0
 *
 * Modifications:
 *     0.15.0 - 2026-08-10 - Initial implementation (Phase 5)
 */

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Loader2, ThumbsDown, X } from 'lucide-react';

import { MatchAvatar } from '@/components/matching/match-avatar';
import { GroupFitBadge } from '@/components/groups/group-fit-badge';
import { ProfileLink } from '@/components/profiles/profile-link';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { decideRequest } from '@/features/groups/actions';
import {
  REJECTION_REASONS,
  rejectionMessageFor,
  type GroupRequestView,
} from '@/features/groups/group-view';

export interface ApplicantReviewDialogProps {
  request: GroupRequestView;
  /** Shown so the admin knows how much room is left before accepting. */
  placesLeft: number;
}

/**
 * Renders the review control and its dialog.
 *
 * @param request    - The pending request being reviewed.
 * @param placesLeft - Remaining places in the group.
 * @returns The button and dialog elements.
 */
export function ApplicantReviewDialog({ request, placesLeft }: ApplicantReviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'profile' | 'reject'>('profile');
  const [reason, setReason] = useState<string>(REJECTION_REASONS[0].value);
  const [custom, setCustom] = useState('');

  const [state, formAction, pending] = useActionState(decideRequest, null);
  const error = state && !state.ok ? state.error : null;

  /* showModal() is the only way to get the platform focus trap, so the element is
     driven imperatively. */
  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  /* Close once a decision lands; the page revalidates behind it. */
  const [handled, setHandled] = useState<unknown>(null);
  if (state?.ok && state !== handled) {
    setHandled(state);
    setOpen(false);
    setStep('profile');
  }

  const preview = rejectionMessageFor(reason, custom);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setStep('profile');
          setOpen(true);
        }}
      >
        Review
      </Button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        aria-labelledby="applicant-title"
        className="bg-surface shadow-clay-lifted m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl p-0 backdrop:bg-black/40 backdrop:backdrop-blur-sm"
      >
        <div className="border-outline-variant/30 flex items-start justify-between gap-4 border-b p-5">
          <h2 id="applicant-title" className="font-heading text-headline-md">
            {step === 'profile' ? 'Join request' : `Reply to ${request.requesterName}`}
          </h2>

          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="text-outline hover:bg-surface-container-high focus-visible:ring-brand/35 shrink-0 rounded-full p-2 transition-colors focus-visible:ring-4 focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5">
          {/* The applicant's profile. Accept and Reject sit directly on it, so the
              decision is made while looking at the person it is about. */}
          <div className="mb-5 flex items-center gap-4">
            <ProfileLink
              profileId={request.requesterId}
              label={`${request.requesterName}’s profile`}
              className="shrink-0"
            >
              <MatchAvatar
                fullName={request.requesterName}
                avatarUrl={request.requesterAvatarUrl}
                size={64}
                className="border-[3px]"
              />
            </ProfileLink>
            <div className="min-w-0">
              <p className="font-heading flex flex-wrap items-center gap-2 text-[18px] leading-tight font-bold">
                <ProfileLink profileId={request.requesterId}>
                  {request.requesterName}
                </ProfileLink>
                <GroupFitBadge score={request.groupScore} />
              </p>
              <p className="text-on-surface-variant text-label-sm font-normal">
                {[
                  request.requesterDegreeName,
                  request.requesterYearOfStudy ? `Year ${request.requesterYearOfStudy}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Classmate'}
              </p>
              <p className="text-outline mt-1 text-label-sm font-normal">
                Asked to join {request.groupName}
              </p>
            </div>
          </div>

          {error ? (
            <p role="alert" className="text-destructive mb-4 flex items-start gap-2 text-label-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error.message}
            </p>
          ) : null}

          {step === 'profile' ? (
            <>
              {placesLeft === 0 ? (
                /* Said before they press Accept, not after it fails. The capacity
                   trigger would refuse it, and finding out that way is worse. */
                <p className="bg-sunset-fixed/60 text-sunset-deep mb-4 rounded-md p-3 text-label-sm">
                  The group is full. Free a place before accepting anyone else.
                </p>
              ) : (
                <p className="text-on-surface-variant mb-4 text-label-sm font-normal">
                  {placesLeft} {placesLeft === 1 ? 'place' : 'places'} left.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <form action={formAction}>
                  <input type="hidden" name="requestId" value={request.id} />
                  <input type="hidden" name="decision" value="approved" />
                  <Button type="submit" disabled={pending || placesLeft === 0}>
                    {pending ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Check aria-hidden="true" />
                    )}
                    Accept
                  </Button>
                </form>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep('reject')}
                  disabled={pending}
                >
                  <ThumbsDown aria-hidden="true" />
                  Reject
                </Button>
              </div>
            </>
          ) : (
            <form action={formAction} className="flex flex-col gap-4">
              <input type="hidden" name="requestId" value={request.id} />
              <input type="hidden" name="decision" value="rejected" />

              <p className="text-on-surface-variant text-body-md text-pretty">
                They will get this as a message from you. Nobody is told they were
                rejected without being told why.
              </p>

              <div className="flex flex-col gap-2">
                <label htmlFor="reject-reason" className="text-label-md">
                  Reason
                </label>
                <select
                  id="reject-reason"
                  name="reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className="border-outline-variant/60 bg-field focus-visible:border-brand focus-visible:ring-brand/25 h-11 w-full rounded-md border px-4 text-body-md transition-colors outline-none focus-visible:bg-white focus-visible:ring-4"
                >
                  {REJECTION_REASONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {reason === 'other' ? (
                <div className="flex flex-col gap-2">
                  <label htmlFor="reject-custom" className="text-label-md">
                    Your message
                  </label>
                  <textarea
                    id="reject-custom"
                    name="customMessage"
                    value={custom}
                    onChange={(event) => setCustom(event.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Thanks for asking — we have already settled on a group of three."
                    className="border-outline-variant/60 bg-field focus-visible:border-brand focus-visible:ring-brand/25 w-full resize-none rounded-md border px-4 py-2 text-body-md transition-colors outline-none focus-visible:bg-white focus-visible:ring-4"
                  />
                </div>
              ) : (
                /* The canned text, shown in full before it is sent. An admin should
                   not send words on their own behalf without reading them. */
                <div className="bg-surface-container-low border-outline-variant/30 rounded-md border p-3">
                  <p className="text-outline mb-1 text-label-sm">They will receive:</p>
                  <p className="text-body-md text-pretty">{preview}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3">
                {/* destructive, not sunset. The design system reserves sunset for
                    the single highest-intent action on a screen, and this is the
                    opposite of that — it is the one with a bad outcome for someone. */}
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={pending || (reason === 'other' && custom.trim().length < 4)}
                >
                  {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  Send and reject
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep('profile')}
                  disabled={pending}
                >
                  Back
                </Button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}

/**
 * A pending request in the admin's list, with the control that opens the review.
 *
 * @param request    - The pending request.
 * @param placesLeft - Remaining places in the group.
 * @returns The list item element.
 */
export function ApplicantRow({
  request,
  placesLeft,
}: {
  request: GroupRequestView;
  placesLeft: number;
}) {
  return (
    <li className="border-outline-variant/40 flex items-center gap-3 rounded-md border bg-white p-3">
      <ProfileLink
        profileId={request.requesterId}
        label={`${request.requesterName}’s profile`}
        className="shrink-0"
      >
        <MatchAvatar
          fullName={request.requesterName}
          avatarUrl={request.requesterAvatarUrl}
          size={40}
          className="border-2"
        />
      </ProfileLink>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-label-md">
          <span className="truncate">
            <ProfileLink profileId={request.requesterId}>{request.requesterName}</ProfileLink>
          </span>
          <GroupFitBadge score={request.groupScore} />
        </p>
        <p className="text-outline truncate text-label-sm font-normal">
          {[
            request.requesterDegreeName,
            request.requesterYearOfStudy ? `Year ${request.requesterYearOfStudy}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'Classmate'}
        </p>
      </div>

      <Chip tone="sunset">Pending</Chip>

      <ApplicantReviewDialog request={request} placesLeft={placesLeft} />
    </li>
  );
}
