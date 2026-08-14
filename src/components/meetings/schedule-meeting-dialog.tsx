/**
 * File:        src/components/meetings/schedule-meeting-dialog.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: "Schedule a session" — the picker behind the calendar icon in the
 *              chat composer.
 *
 *              IT OPENS ON THE GRID, and that is the whole point of this
 *              revision. The list it replaced answered "what times are free" by
 *              printing every one of them, which for a well-filled week ran to
 *              dozens of buttons under a dozen headings — a wall of text where
 *              the actual question is spatial. A week laid out as a week is read
 *              at a glance: this column is busy, that afternoon is clear.
 *
 *              GREY IS NOT A DISABLED BUTTON, IT IS NOT A BUTTON. Cells with no
 *              shared time render as plain <td> content with aria-hidden marks,
 *              so a keyboard lands only on times that can actually be picked and
 *              a screen reader is not read a hundred "unavailable" controls to
 *              get through a week. The grid stays a table either way, so the row
 *              and column headers still say what a cell means.
 *
 *              THE LIST SURVIVES BECAUSE THE GRID CANNOT SAY EVERYTHING. Exact
 *              times, in order, with nothing to decode — that is what the list is
 *              better at, and it is what somebody wants when they already know
 *              they are free Thursday and only need the hour. It paginates by day
 *              rather than by slot: cutting a day in half to hit a row budget
 *              produces a "load more" that reveals three more hours of a day
 *              already on screen, which reads as a bug.
 *
 *              BOTH VIEWS SHARE ONE SELECTION, held as slot start times. That is
 *              what makes the toggle safe to press mid-pick — switching view is
 *              a change of lens, never a reset — and it is why selection state
 *              lives here rather than inside either view.
 * Version:     0.30.0
 *
 * Modifications:
 *     0.30.0 - 2026-08-14 - Grid view, multi-selection, day pagination (Phase 9H)
 *     0.19.0 - 2026-08-11 - Initial implementation (Phase 7)
 */

'use client';

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  AlertCircle,
  CalendarClock,
  CalendarDays,
  Check,
  List,
  Loader2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createMeeting, findMeetingSlots } from '@/features/meetings/actions';
import {
  SCHEDULER_WINDOW_DAYS,
  buildSlotGrid,
  defaultMeetingTitle,
  formatSlotRange,
  groupSlotsByDay,
  mergeSelectedSlots,
  type MeetingSlotView,
  type SelectedRun,
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

/** How many days the list reveals at a time. */
const LIST_PAGE_DAYS = 3;

type PickerView = 'grid' | 'list';

/** A fine-tuned start/end for one run, keyed by the run's id. */
type RunEdits = Record<string, { startsAt: string; endsAt: string }>;

/** `14:00`, for a time input, in the reader's zone. */
function toTimeValue(iso: string): string {
  const date = new Date(iso);

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Moves an instant to a wall-clock time on its own day.
 *
 * @param iso   - The instant whose day is kept.
 * @param value - `HH:mm` from a time input.
 * @returns The new instant, as ISO.
 */
function withTime(iso: string, value: string): string {
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date(iso);

  date.setHours(hours, minutes, 0, 0);

  return date.toISOString();
}

/**
 * Renders the scheduler.
 *
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
  const [view, setView] = useState<PickerView>('grid');
  /* Slot start times. One set, both views — see the header note. */
  const [selected, setSelected] = useState<string[]>([]);
  const [edits, setEdits] = useState<RunEdits>({});
  const [visibleDays, setVisibleDays] = useState(LIST_PAGE_DAYS);

  const [loading, startLoading] = useTransition();

  const error = state && !state.ok ? state.error : null;

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

  useEffect(() => {
    if (!open) {
      return;
    }

    startLoading(async () => {
      const result = await findMeetingSlots({
        conversationId,
        groupId,
        days: SCHEDULER_WINDOW_DAYS,
      });

      if (result.ok) {
        setSlots(result.data);
      } else {
        setLoadError(result.error.message);
      }
    });
  }, [open, conversationId, groupId]);

  /* Reset on close, during render rather than in an effect — the same pattern
     the details dialog and the chat composer use. */
  const [openWas, setOpenWas] = useState(open);

  if (openWas !== open) {
    setOpenWas(open);
    setSelected([]);
    setEdits({});
    setVisibleDays(LIST_PAGE_DAYS);
    setView('grid');
    /* Or a failure from last time would still be on screen while this open is
       still loading, describing an attempt nobody made. */
    setLoadError(null);
  }

  const handledRef = useRef<unknown>(null);

  useEffect(() => {
    if (state?.ok === true && handledRef.current !== state) {
      handledRef.current = state;
      onClose();
    }
  }, [state, onClose]);

  /* Memoised, not `slots ?? []` inline: a fresh array every render would make
     every memo below it recompute, which is the whole cost they exist to avoid. */
  const offered = useMemo(() => slots ?? [], [slots]);
  const grid = useMemo(() => buildSlotGrid(offered), [offered]);
  const days = useMemo(() => groupSlotsByDay(offered), [offered]);
  const runs = useMemo(() => mergeSelectedSlots(offered, selected), [offered, selected]);

  const toggle = (startsAt: string) => {
    setSelected((current) =>
      current.includes(startsAt)
        ? current.filter((key) => key !== startsAt)
        : [...current, startsAt],
    );
    /* Merging can reshape every run, so hand-trimmed hours no longer describe
       anything. Cheaper to re-tune than to guess which edits survived. */
    setEdits({});
  };

  /** The run as it will be booked, with any fine-tuning applied. */
  const bookable = runs.map((run) => ({
    run,
    startsAt: edits[run.id]?.startsAt ?? run.startsAt,
    endsAt: edits[run.id]?.endsAt ?? run.endsAt,
  }));

  const isEmpty = !loading && slots !== null && offered.length === 0;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="schedule-meeting-title"
      className="bg-surface shadow-clay-lifted m-auto w-[min(46rem,calc(100vw-2rem))] rounded-xl p-0 backdrop:bg-black/40 backdrop:backdrop-blur-sm"
    >
      <div className="border-outline-variant/30 flex items-start justify-between gap-4 border-b p-5">
        <div>
          <h2 id="schedule-meeting-title" className="font-heading text-headline-md">
            Schedule a session
          </h2>
          <p className="text-on-surface-variant mt-1 text-body-md text-pretty">
            The next {SCHEDULER_WINDOW_DAYS} days, showing hours you and {withLabel} are
            both free with anything already booked taken out. Pick as many as you like.
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

        {/* One pair per session. Order is what pairs them on the server. */}
        {bookable.map((session) => (
          <input key={session.run.id} type="hidden" name="startsAt" value={session.startsAt} />
        ))}
        {bookable.map((session) => (
          <input key={session.run.id} type="hidden" name="endsAt" value={session.endsAt} />
        ))}

        {error ? (
          <p role="alert" className="text-destructive flex items-start gap-2 text-label-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error.message}
          </p>
        ) : null}

        {/*
          * THE ERROR IS TESTED FIRST, and that ordering is the fix for a bug
          * this branch had from the start. `slots` is only ever set on success,
          * so a failed load left it null — and with the spinner's condition
          * checked first, the picker sat on "Working out when you are both
          * free..." forever, with the reason it had already been given never
          * reaching the screen.
          */}
        {loadError ? (
          <p role="alert" className="text-destructive flex items-start gap-2 text-label-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {loadError}
          </p>
        ) : loading || slots === null ? (
          <p className="text-outline flex items-center gap-2 py-6 text-label-md">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Working out when you are both free...
          </p>
        ) : isEmpty ? (
          <div className="border-outline-variant/60 rounded-md border border-dashed p-4">
            <p className="text-label-md">
              No shared free time in the next {SCHEDULER_WINDOW_DAYS} days
            </p>
            <p className="text-outline mt-1 text-label-sm font-normal text-pretty">
              Either your weeks do not overlap, or everything they share is already booked.
              Adding more hours in your profile is the fastest way to find one.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-label-md">Pick your times</p>
              <ViewToggle view={view} onChange={setView} />
            </div>

            {view === 'grid' ? (
              <SlotGridView grid={grid} selected={selected} onToggle={toggle} />
            ) : (
              <SlotListView
                days={days}
                visibleDays={visibleDays}
                onShowMore={() =>
                  setVisibleDays((current) =>
                    Math.min(current + LIST_PAGE_DAYS, days.length),
                  )
                }
                onShowLess={() => setVisibleDays(LIST_PAGE_DAYS)}
                selected={selected}
                onToggle={toggle}
              />
            )}

            {bookable.length > 0 ? (
              <FineTune
                sessions={bookable}
                onChange={(id, next) =>
                  setEdits((current) => ({ ...current, [id]: next }))
                }
              />
            ) : null}

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
        )}

        <div className="border-outline-variant/30 flex flex-wrap items-center gap-3 border-t pt-4">
          <Button type="submit" disabled={saving || bookable.length === 0}>
            {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            <CalendarClock className="size-4" aria-hidden="true" />
            {bookable.length > 1 ? `Schedule ${bookable.length} sessions` : 'Schedule it'}
          </Button>

          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>

          {bookable.length === 0 && !isEmpty ? (
            <span className="text-outline text-label-sm">Pick a time first</span>
          ) : null}
        </div>
      </form>
    </dialog>
  );
}

/**
 * The grid/list switch.
 *
 * @returns The toggle element.
 */
function ViewToggle({
  view,
  onChange,
}: {
  view: PickerView;
  onChange: (next: PickerView) => void;
}) {
  const options: Array<{ value: PickerView; label: string; Icon: typeof CalendarDays }> = [
    { value: 'grid', label: 'Grid', Icon: CalendarDays },
    { value: 'list', label: 'List', Icon: List },
  ];

  return (
    <div
      role="group"
      aria-label="How to show the times"
      className="border-outline-variant/60 flex items-center gap-1 rounded-full border bg-white p-1"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={view === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-label-sm transition-colors',
            'focus-visible:ring-brand/35 focus-visible:ring-4 focus-visible:outline-none',
            view === option.value
              ? 'bg-brand text-white'
              : 'text-on-surface-variant hover:bg-surface-container-high',
          )}
        >
          <option.Icon className="size-3.5" aria-hidden="true" />
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The week as a table: days across, hours down.
 *
 * @returns The grid element.
 */
function SlotGridView({
  grid,
  selected,
  onToggle,
}: {
  grid: ReturnType<typeof buildSlotGrid>;
  selected: string[];
  onToggle: (startsAt: string) => void;
}) {
  return (
    /*
     * Horizontal scroll on narrow screens rather than a cramped grid, exactly as
     * the availability screen does it: seven columns cannot fit a phone legibly,
     * and shrinking them makes the targets too small to tap accurately.
     *
     * shrink-0 is load-bearing and not obvious. This is a flex child of the
     * form's `max-h-[70vh] flex-col` scroll area, so it shrinks by default — and
     * because overflow-x-auto makes this a scroll container, the shrink clips the
     * bottom rows rather than letting them push the form taller. The symptom is a
     * grid that stops mid-row with the title field under it.
     */
    <div className="-mx-1 shrink-0 overflow-x-auto px-1 pb-2">
      <table className="w-full min-w-[36rem] border-separate border-spacing-1">
        <caption className="sr-only">
          Shared free time. Only the times you are both free can be selected.
        </caption>
        <thead>
          <tr>
            <th className="w-14" />
            {grid.columns.map((column) => (
              <th key={column.date} scope="col" className="pb-1">
                <span className="text-on-surface-variant block text-label-sm">
                  {column.weekday}
                </span>
                <span className="text-outline block text-[11px] font-normal">
                  {column.dayLabel}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.times.map((time) => (
            <tr key={time}>
              <th
                scope="row"
                className="text-outline pr-2 text-right text-label-sm font-normal"
              >
                {time}
              </th>

              {grid.columns.map((column) => {
                const slot = column.slotsByTime[time];

                if (!slot) {
                  /*
                   * Not a disabled button — not a control at all. Keyboard focus
                   * skips it and a screen reader is not read dozens of
                   * "unavailable" stops to cross a week. The row and column
                   * headers still say what the cell is.
                   */
                  return (
                    <td key={column.date}>
                      <div
                        aria-hidden="true"
                        className="bg-surface-container-high/60 border-outline-variant/30 h-9 w-full rounded-sm border"
                      />
                    </td>
                  );
                }

                const isOn = selected.includes(slot.startsAt);

                return (
                  <td key={column.date}>
                    <button
                      type="button"
                      onClick={() => onToggle(slot.startsAt)}
                      aria-pressed={isOn}
                      aria-label={`${column.weekday} ${column.dayLabel}, ${formatSlotRange(
                        slot.startsAt,
                        slot.endsAt,
                      )}`}
                      className={cn(
                        'flex h-9 w-full items-center justify-center rounded-sm border transition-colors',
                        'focus-visible:ring-brand/35 focus-visible:ring-4 focus-visible:outline-none',
                        isOn
                          ? 'border-brand bg-brand text-white'
                          : 'border-outline-variant/50 hover:bg-brand-fixed/60 hover:border-brand/40 bg-white',
                      )}
                    >
                      {isOn ? <Check className="size-3.5" aria-hidden="true" /> : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The same times as a list, a few days at a time.
 *
 * @returns The list element.
 */
function SlotListView({
  days,
  visibleDays,
  onShowMore,
  onShowLess,
  selected,
  onToggle,
}: {
  days: ReturnType<typeof groupSlotsByDay>;
  visibleDays: number;
  onShowMore: () => void;
  onShowLess: () => void;
  selected: string[];
  onToggle: (startsAt: string) => void;
}) {
  const showing = days.slice(0, visibleDays);
  const hiddenDays = days.length - showing.length;

  return (
    <div className="flex flex-col gap-4">
      {showing.map((day) => (
        <div key={day.date}>
          <p className="text-on-surface-variant mb-2 text-label-sm">{day.label}</p>

          <div className="flex flex-wrap gap-2">
            {day.slots.map((slot) => {
              const isOn = selected.includes(slot.startsAt);

              return (
                <button
                  key={slot.startsAt}
                  type="button"
                  onClick={() => onToggle(slot.startsAt)}
                  aria-pressed={isOn}
                  className={cn(
                    'rounded-md border px-3 py-2 text-label-sm transition-colors',
                    'focus-visible:ring-brand/35 focus-visible:ring-4 focus-visible:outline-none',
                    isOn
                      ? 'border-brand bg-brand text-white'
                      : 'border-outline-variant/60 hover:bg-brand-fixed/60 bg-white',
                  )}
                >
                  {isOn ? (
                    <Check className="mr-1 inline size-3.5" aria-hidden="true" />
                  ) : null}
                  {formatSlotRange(slot.startsAt, slot.endsAt)}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* By the day, never mid-day: revealing three more hours of a day already
          on screen reads as a bug rather than as more results. */}
      <div className="flex flex-wrap items-center gap-3">
        {hiddenDays > 0 ? (
          <button
            type="button"
            onClick={onShowMore}
            className="text-brand hover:text-brand-bright focus-visible:ring-brand/35 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none"
          >
            Load more ({hiddenDays} more {hiddenDays === 1 ? 'day' : 'days'})
          </button>
        ) : null}

        {visibleDays > LIST_PAGE_DAYS ? (
          <button
            type="button"
            onClick={onShowLess}
            className="text-on-surface-variant hover:text-brand focus-visible:ring-brand/35 rounded-md text-label-sm transition-colors focus-visible:ring-4 focus-visible:outline-none"
          >
            Load less
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The hours of each session about to be booked, adjustable within its own block.
 *
 * BOUNDED BY THE SELECTION, NOT BY THE DAY. The min and max on each input are
 * the run's own edges, so trimming can shorten a session but never push it into
 * an hour the other participants never offered — which the database would refuse
 * anyway, but far too late to be useful.
 *
 * @returns The fine-tune panel.
 */
function FineTune({
  sessions,
  onChange,
}: {
  sessions: Array<{ run: SelectedRun; startsAt: string; endsAt: string }>;
  onChange: (id: string, next: { startsAt: string; endsAt: string }) => void;
}) {
  return (
    <div className="border-outline-variant/30 bg-surface-container-high/40 shadow-clay flex flex-col gap-3 rounded-xl border p-4">
      <p className="text-label-sm font-semibold">
        {sessions.length === 1
          ? 'Fine-tune session hours'
          : `Fine-tune ${sessions.length} sessions`}
      </p>

      {sessions.map((session) => {
        const startId = `tune-start-${session.run.id}`;
        const endId = `tune-end-${session.run.id}`;

        return (
          <div key={session.run.id} className="flex flex-wrap items-end gap-3">
            <span
              suppressHydrationWarning
              className="text-on-surface-variant min-w-28 text-label-sm"
            >
              {new Date(session.run.startsAt).toLocaleDateString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </span>

            <div className="flex flex-col gap-1">
              <Label htmlFor={startId} className="text-label-xs">
                Start
              </Label>
              <input
                id={startId}
                type="time"
                value={toTimeValue(session.startsAt)}
                min={toTimeValue(session.run.startsAt)}
                max={toTimeValue(session.endsAt)}
                onChange={(event) =>
                  onChange(session.run.id, {
                    startsAt: withTime(session.run.startsAt, event.target.value),
                    endsAt: session.endsAt,
                  })
                }
                className="border-outline-variant bg-surface rounded-md border px-2.5 py-1.5 text-sm"
              />
            </div>

            <span className="pb-1.5">–</span>

            <div className="flex flex-col gap-1">
              <Label htmlFor={endId} className="text-label-xs">
                End
              </Label>
              <input
                id={endId}
                type="time"
                value={toTimeValue(session.endsAt)}
                min={toTimeValue(session.startsAt)}
                max={toTimeValue(session.run.endsAt)}
                onChange={(event) =>
                  onChange(session.run.id, {
                    startsAt: session.startsAt,
                    endsAt: withTime(session.run.endsAt, event.target.value),
                  })
                }
                className="border-outline-variant bg-surface rounded-md border px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
