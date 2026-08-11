/**
 * File:        src/components/meetings/schedule-meeting-dialog.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Schedule a meeting" — the picker behind the calendar icon in the
 *              chat composer.
 *
 *              A native <dialog>, the same shell as the course override
 *              questionnaire and the week editor, so focus trapping, Escape and
 *              the backdrop come from the platform.
 *
 *              IT ONLY EVER OFFERS TIMES EVERYONE IS FREE. The list comes from
 *              rpc_meeting_slots — the intersection of every participant's weekly
 *              grid, with everybody's existing sessions already subtracted — so
 *              there is no free-text time field and nothing to validate against
 *              other people's diaries. An empty list is a real answer, and says
 *              which of the two reasons produced it.
 *
 *              THE TRIGGER IS NOT IN HERE. The composer is a <form>, and a form
 *              cannot legally contain another one, so the chat owns the button
 *              and this owns everything the button opens.
 * Version:     0.19.0
 *
 * Modifications:
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7)
 */

'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { AlertCircle, CalendarClock, Check, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createMeeting, findMeetingSlots } from '@/features/meetings/actions';
import {
  defaultMeetingTitle,
  formatSlotRange,
  groupSlotsByDay,
  type MeetingSlotView,
} from '@/features/meetings/meeting-view';
import { cn } from '@/lib/utils';

export interface ScheduleMeetingDialogProps {
  open: boolean;
  onClose: () => void;
  /** Exactly one of these, matching the meetings_one_scope constraint. */
  conversationId?: string;
  groupId?: string;
  /** Named in the copy, so it is obvious who the session is with. */
  withLabel: string;
  /** Seeds the title, so the field is never empty on open. */
  courseCode: string | null;
}

/**
 * Renders the scheduling dialog.
 *
 * @param props - The chat it belongs to and who is in it.
 * @returns The dialog element.
 */
export function ScheduleMeetingDialog({
  open,
  onClose,
  conversationId,
  groupId,
  withLabel,
  courseCode,
}: ScheduleMeetingDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, saving] = useActionState(createMeeting, null);

  const [slots, setSlots] = useState<MeetingSlotView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<MeetingSlotView | null>(null);
  const [loading, startLoading] = useTransition();

  const error = state && !state.ok ? state.error : null;

  /* showModal() is the only way to get the platform's focus trap and backdrop;
     it cannot be expressed as a prop, so the element is driven imperatively. */
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

  /*
   * The intersection is fetched on open rather than with the chat. It reads
   * every participant's availability and every meeting any of them is going to,
   * which is far too much work to do for a chat nobody has opened this on.
   *
   * Nothing is reset here: the chat remounts this component on every open, so
   * the state below already starts empty. That also makes a second open re-ask
   * rather than showing the slots from ten minutes ago.
   */
  useEffect(() => {
    if (!open) {
      return;
    }

    startLoading(async () => {
      const result = await findMeetingSlots({ conversationId, groupId, days: 14 });

      if (result.ok) {
        setSlots(result.data);
      } else {
        setLoadError(result.error.message);
      }
    });
  }, [open, conversationId, groupId]);

  /*
   * Close once the booking succeeds — the chat revalidates behind it.
   *
   * IN AN EFFECT, unlike the course and availability dialogs, which do the same
   * thing during render. They can: the state they set is their own, and React
   * allows a component to update itself mid-render. This one closes by calling
   * the CHAT's setter, because the trigger has to live inside the composer form —
   * and updating a different component during render is the one thing that rule
   * does not cover.
   */
  const handledRef = useRef<unknown>(null);

  useEffect(() => {
    if (state?.ok === true && handledRef.current !== state) {
      handledRef.current = state;
      onClose();
    }
  }, [state, onClose]);

  const days = groupSlotsByDay(slots ?? []);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="schedule-meeting-title"
      className="bg-surface shadow-clay-lifted m-auto w-[min(34rem,calc(100vw-2rem))] rounded-xl p-0 backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="border-outline-variant/30 flex items-start justify-between gap-4 border-b p-5">
        <div>
          <h2 id="schedule-meeting-title" className="font-heading text-headline-md">
            Schedule a session
          </h2>
          <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
            These are the hours you and {withLabel} are both free, with anything already
            booked taken out.
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-outline hover:bg-surface-container-high focus-visible:ring-brand/35 shrink-0 rounded-full p-2 transition-colors focus-visible:ring-4 focus-visible:outline-none"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      <form action={formAction} className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto p-5">
        {conversationId ? (
          <input type="hidden" name="conversationId" value={conversationId} />
        ) : null}
        {groupId ? <input type="hidden" name="groupId" value={groupId} /> : null}
        <input type="hidden" name="startsAt" value={chosen?.startsAt ?? ''} />
        <input type="hidden" name="endsAt" value={chosen?.endsAt ?? ''} />

        {error ? (
          <p role="alert" className="text-destructive flex items-start gap-2 text-label-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error.message}
          </p>
        ) : null}

        {loading || slots === null ? (
          <p className="text-outline flex items-center gap-2 py-6 text-label-md">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Working out when you are both free...
          </p>
        ) : loadError ? (
          <p role="alert" className="text-destructive flex items-start gap-2 text-label-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {loadError}
          </p>
        ) : days.length === 0 ? (
          /*
           * An empty intersection has two very different causes and the student
           * can only act on one of them, so the copy names both rather than
           * saying "no times available" and leaving them stuck.
           */
          <div className="border-outline-variant/60 rounded-md border border-dashed p-4">
            <p className="text-label-md">No shared free time in the next two weeks</p>
            <p className="text-outline mt-1 text-label-sm font-normal text-pretty">
              Either your weeks do not overlap, or everything they share is already booked.
              Adding more hours in your profile is the fastest way to find one.
            </p>
          </div>
        ) : (
          <fieldset className="flex flex-col gap-4">
            <legend className="text-label-md mb-1">Pick a time</legend>

            {days.map((day) => (
              <div key={day.date}>
                <p className="text-on-surface-variant mb-2 text-label-sm">{day.label}</p>

                <div className="flex flex-wrap gap-2">
                  {day.slots.map((slot) => {
                    const isChosen = chosen?.startsAt === slot.startsAt;

                    return (
                      <button
                        key={slot.startsAt}
                        type="button"
                        onClick={() => setChosen(slot)}
                        aria-pressed={isChosen}
                        className={cn(
                          'rounded-md border px-3 py-2 text-label-sm transition-colors',
                          'focus-visible:ring-brand/35 focus-visible:ring-4 focus-visible:outline-none',
                          isChosen
                            ? 'border-brand bg-brand text-white'
                            : 'border-outline-variant/60 hover:bg-brand-fixed/60 bg-white',
                        )}
                      >
                        {isChosen ? (
                          <Check className="mr-1 inline size-3.5" aria-hidden="true" />
                        ) : null}
                        {formatSlotRange(slot.startsAt, slot.endsAt)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </fieldset>
        )}

        {days.length > 0 ? (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="meeting-title">What is it for?</Label>
              <Input
                id="meeting-title"
                name="title"
                defaultValue={defaultMeetingTitle(courseCode)}
                maxLength={120}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="meeting-location">Where? (optional)</Label>
              <Input
                id="meeting-location"
                name="location"
                maxLength={200}
                placeholder="Library, floor 2 — or a video call"
              />
            </div>
          </>
        ) : null}

        <div className="border-outline-variant/30 flex flex-wrap items-center gap-3 border-t pt-4">
          <Button type="submit" disabled={saving || !chosen}>
            {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            <CalendarClock className="size-4" aria-hidden="true" />
            Schedule it
          </Button>

          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>

          {/* The reason the button is closed, beside it rather than replacing
              its label — a disabled control with no explanation is a dead end. */}
          {!chosen && days.length > 0 ? (
            <span className="text-outline text-label-sm">Pick a time first</span>
          ) : null}
        </div>
      </form>
    </dialog>
  );
}
