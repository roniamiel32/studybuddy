/**
 * File:        src/components/meetings/schedule-meeting-dialog.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Schedule a meeting" — the picker behind the calendar icon in the
 *              chat composer.
 * Version:     0.19.0
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
  conversationId?: string;
  groupId?: string;
  withLabel: string;
  courseCode: string | null;
}

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
  
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const [loading, startLoading] = useTransition();

  const error = state && !state.ok ? state.error : null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setChosen(null);
      setCustomStart('');
      setCustomEnd('');
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

  const handledRef = useRef<unknown>(null);

  useEffect(() => {
    if (state?.ok === true && handledRef.current !== state) {
      handledRef.current = state;
      onClose();
    }
  }, [state, onClose]);

  const days = groupSlotsByDay(slots ?? []);

  const toTimeString = (iso: string) => {
    if (!iso) return '';
    const date = new Date(iso);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const handleStartChange = (timeStr: string) => {
    if (!chosen) return;
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date(chosen.startsAt);
    date.setHours(hours, minutes, 0, 0);
    setCustomStart(date.toISOString());
  };

  const handleEndChange = (timeStr: string) => {
    if (!chosen) return;
    const [hours, minutes] = timeStr.split(':').map(Number);
    const date = new Date(chosen.endsAt);
    date.setHours(hours, minutes, 0, 0);
    setCustomEnd(date.toISOString());
  };

  const handleSelectSlot = (slot: MeetingSlotView) => {
    setChosen(slot);
    setCustomStart(slot.startsAt);
    setCustomEnd(slot.endsAt);
  };

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
        
        <input type="hidden" name="startsAt" value={(customStart || chosen?.startsAt) ?? ''} />
        <input type="hidden" name="endsAt" value={(customEnd || chosen?.endsAt) ?? ''} />

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
                        onClick={() => handleSelectSlot(slot)}
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

        {chosen ? (
          <div className="rounded-xl border border-outline-variant/30 bg-surface-container-high/40 p-4 shadow-clay flex flex-col gap-3">
            <p className="text-label-sm font-semibold">Fine-tune session hours</p>
            <div className="flex items-center gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor="custom-start" className="text-label-xs">Start Time</Label>
                <input
                  id="custom-start"
                  type="time"
                  value={toTimeString(customStart || chosen.startsAt)}
                  min={toTimeString(chosen.startsAt)}
                  max={toTimeString(customEnd || chosen.endsAt)}
                  onChange={(e) => handleStartChange(e.target.value)}
                  className="rounded-md border border-outline-variant bg-surface px-2.5 py-1.5 text-sm"
                />
              </div>
              <span className="mt-5">–</span>
              <div className="flex flex-col gap-1">
                <Label htmlFor="custom-end" className="text-label-xs">End Time</Label>
                <input
                  id="custom-end"
                  type="time"
                  value={toTimeString(customEnd || chosen.endsAt)}
                  min={toTimeString(customStart || chosen.startsAt)}
                  max={toTimeString(chosen.endsAt)}
                  onChange={(e) => handleEndChange(e.target.value)}
                  className="rounded-md border border-outline-variant bg-surface px-2.5 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>
        ) : null}

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

          {!chosen && days.length > 0 ? (
            <span className="text-outline text-label-sm">Pick a time first</span>
          ) : null}
        </div>
      </form>
    </dialog>
  );
}