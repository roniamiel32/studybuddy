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
 * Version:     0.47.0
 *
 * Modifications:
 *     0.47.0 - 2026-08-19 - The course code is gone; the title names the partner
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
  Repeat,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createMeeting, findMeetingSlots } from '@/features/meetings/actions';
import {
  SCHEDULER_GRID_DAYS,
  SCHEDULER_WINDOW_DAYS,
  buildSlotGrid,
  campusTimeValue,
  campusToday,
  clampSlotsToGridRows,
  defaultMeetingTitle,
  formatDuration,
  formatSlotRange,
  groupSlotsByDay,
  mergeSelectedSlots,
  mergeSlotsIntoBlocks,
  withCampusTime,
  type MeetingSlotView,
  type SelectedRun,
} from '@/features/meetings/meeting-view';
import { cn } from '@/lib/utils';

export interface ScheduleMeetingDialogProps {
  open: boolean;
  onClose: () => void;
  conversationId?: string;
  groupId?: string;
  /**
   * Who the session is with — the other student's name, or the group's.
   *
   * Two jobs: it is read out in the dialog's own copy, and it is what the
   * default title is built from. There is no course code beside it any more —
   * the picker used to take one and put it in the title, where it repeated the
   * chat header and said nothing about who was going.
   */
  withLabel: string;
}

/** How many days the list reveals at a time. */
const LIST_PAGE_DAYS = 3;

type PickerView = 'grid' | 'list';

/** A fine-tuned start/end for one run, keyed by the run's id. */
type RunEdits = Record<string, { startsAt: string; endsAt: string }>;

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
  const [weekOffset, setWeekOffset] = useState(0);
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
    setWeekOffset(0);
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

  /*
   * Memoised, not `slots ?? []` inline: a fresh array every render would make
   * every memo below it recompute, which is the whole cost they exist to avoid.
   *
   * CLAMPED ONCE, HERE, so the grid, the list and the merge all reason about the
   * same slots. Doing it inside buildSlotGrid would leave the list offering
   * blocks the grid could not draw.
   */
  const offered = useMemo(() => clampSlotsToGridRows(slots ?? []), [slots]);
  const grid = useMemo(() => {
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + (weekOffset * 7));

    /* One WEEK of columns, out of a two-week fetch. SCHEDULER_WINDOW_DAYS here
       would draw fourteen columns side by side instead of paging through two
       sets of seven. */
    return buildSlotGrid(offered, SCHEDULER_GRID_DAYS, baseDate);
  }, [offered, weekOffset]);
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

  /**
   * Selects or clears every slot inside one list block at once.
   *
   * THE JOIN BETWEEN WHAT THE LIST DRAWS AND WHAT GETS BOOKED. The list shows a
   * merged range; selection is still per slot, because that is what the grid
   * works in and what mergeSelectedSlots re-merges. A press moves all of the
   * block's slots together so the two never disagree.
   */
  const toggleBlock = (slotStarts: string[], select: boolean) => {
    setSelected((current) => {
      const rest = current.filter((key) => !slotStarts.includes(key));

      return select ? [...rest, ...slotStarts] : rest;
    });
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
              <div className="flex flex-col gap-2">
                <SlotGridView grid={grid} selected={selected} onToggle={toggle} />

                <div className="flex items-center justify-between px-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setWeekOffset((current) => current - 1)}
                    disabled={weekOffset === 0}
                    className="text-brand hover:text-brand-bright focus-visible:ring-brand/35 rounded-md text-label-sm font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:ring-4 focus-visible:outline-none"
                  >
                    &lt; Previous week
                  </button>

                  <button
                    type="button"
                    onClick={() => setWeekOffset((current) => current + 1)}
                    disabled={weekOffset >= 1}
                    className="text-brand hover:text-brand-bright focus-visible:ring-brand/35 rounded-md text-label-sm font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:ring-4 focus-visible:outline-none"
                  >
                    Next week &gt;
                  </button>
                </div>
              </div>
            ) : (
              <SlotListView
                days={days}
                onToggleBlock={toggleBlock}
                visibleDays={visibleDays}
                onShowMore={() =>
                  setVisibleDays((current) =>
                    Math.min(current + LIST_PAGE_DAYS, days.length),
                  )
                }
                onShowLess={() => setVisibleDays(LIST_PAGE_DAYS)}
                selected={selected}
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
                defaultValue={defaultMeetingTitle()}
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

            {/*
              * A NATIVE CHECKBOX INSIDE ITS LABEL, so the whole box is the
              * target and the explanation is part of what you press. An
              * unticked one posts nothing at all, which is the absence the
              * action reads as false.
              */}
            <label
              htmlFor="meeting-repeat"
              className="border-outline-variant/60 hover:bg-brand-fixed/30 flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors"
            >
              <input
                id="meeting-repeat"
                name="repeatWeekly"
                type="checkbox"
                className="accent-brand mt-0.5 size-4 shrink-0"
              />
              <span>
                <span className="text-label-md flex items-center gap-1.5">
                  <Repeat className="size-3.5" aria-hidden="true" />
                  Repeat weekly
                </span>
                <span className="text-on-surface-variant mt-0.5 block text-label-sm font-normal text-pretty">
                  {bookable.length > 1
                    ? 'Books each of these times every week and keeps them free for everyone. Stop it whenever you like.'
                    : 'Books the same time every week and keeps it free for everyone. Stop it whenever you like.'}
                </span>
              </span>
            </label>
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
 * TODAY IS MARKED AND THE DAYS BEHIND IT ARE STRUCK THROUGH. The grid always
 * draws a whole Sunday-to-Saturday week, so opening it on a Thursday shows four
 * columns that are simply over — and an empty column is ambiguous in a picker
 * whose whole job is showing emptiness: "nobody is free" and "this day has been
 * and gone" looked identical. The strikethrough answers that without a legend,
 * and the marked column gives the eye somewhere to start.
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
  /*
   * Read once per render, not once per column: seven calls would be seven
   * Intl formats for one answer, and a column comparing itself against a
   * different instant than its neighbour is a bug waiting for midnight.
   */
  const today = campusToday();

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
      {/* table-fixed, so the seven day columns are exactly equal. Without it the
          browser sizes each column to its own content and a long day label
          makes its column wider than its neighbours. */}
      <table className="w-full min-w-[36rem] table-fixed border-separate border-spacing-1">
        <caption className="sr-only">
          Shared free time. Only the times you are both free can be selected.
        </caption>
        <thead>
          <tr>
            <th className="w-14" />
            {grid.columns.map((column) => {
              /* Both are day-key comparisons, so the time of day cannot come
                 into it — see campusToday. */
              const isToday = column.date === today;
              const isPast = column.date < today;

              return (
                <th key={column.date} scope="col" className="pb-1">
                  <span
                    className={cn(
                      'block text-label-sm',
                      isToday ? 'text-brand font-bold' : 'text-on-surface-variant',
                      isPast && 'opacity-50'
                    )}
                  >
                    {column.weekday}
                  </span>
                  <span
                    className={cn(
                      'block text-[11px]',
                      isToday ? 'text-brand font-bold' : 'text-outline font-normal',
                      isPast && 'opacity-50'

                    )}
                  >
                    {column.dayLabel}
                  </span>
                </th>
              );
            })}
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
                const slotsArray = column.slotsByTime[time];
                const slot = slotsArray?.[0];

                const isPast = column.date < today;

                if (!slot) {
                  return (
                    <td key={column.date}>
                      <div
                        aria-hidden="true"
                        className={cn(
                          "relative h-9 w-full rounded-sm border overflow-hidden",
                          isPast
                            ? "opacity-60 bg-surface-container-high/40 border-outline-variant/50"
                            : "bg-surface-container-high/60 border-outline-variant/30"
                        )}
                      >
                        {isPast && (
                          <svg className="absolute inset-0 h-full w-full text-outline" preserveAspectRatio="none" viewBox="0 0 100 100">
                            <line x1="0" y1="0" x2="100" y2="100" stroke="currentColor" strokeWidth="1.5" />
                          </svg>
                        )}
                      </div>
                    </td>
                  );
                }

                const isOn = selected.includes(slot.startsAt);
                /*
                 * A cell that does not fill its whole row says so on its face.
                 * The row heading is the only label a full cell needs, but a
                 * partial one books something the heading does not name — and
                 * being asked to confirm 15:00 from a cell in the 14:00 row is
                 * the surprise this whole clamp exists to remove.
                 */
                const rowEnd = `${String(Number(time.slice(0, 2)) + 2).padStart(2, '0')}:00`;
                const partial =
                  campusTimeValue(slot.startsAt) !== time || campusTimeValue(slot.endsAt) !== rowEnd;

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
                        'flex h-9 w-full items-center justify-center gap-1 rounded-sm border transition-colors',
                        'focus-visible:ring-brand/35 focus-visible:ring-4 focus-visible:outline-none',
                        isOn
                          ? 'border-brand bg-brand text-white'
                          : 'border-outline-variant/50 hover:bg-brand-fixed/60 hover:border-brand/40 bg-white',
                      )}
                    >
                      {isOn ? <Check className="size-3.5" aria-hidden="true" /> : null}
                      {partial ? (
                        <span
                          suppressHydrationWarning
                          className={cn(
                            'text-[10px] leading-none font-medium',
                            isOn ? 'text-white' : 'text-outline',
                          )}
                        >
                          {campusTimeValue(slot.startsAt)}–{campusTimeValue(slot.endsAt)}
                        </span>
                      ) : null}
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
  onToggleBlock,
}: {
  days: ReturnType<typeof groupSlotsByDay>;
  visibleDays: number;
  onShowMore: () => void;
  onShowLess: () => void;
  selected: string[];
  onToggleBlock: (slotStarts: string[], select: boolean) => void;
}) {
  const showing = days.slice(0, visibleDays);
  const hiddenDays = days.length - showing.length;

  return (
    <div className="flex flex-col gap-4">
      {showing.map((day) => (
        <div key={day.date}>
          <p className="text-on-surface-variant mb-2 text-label-sm">{day.label}</p>

          {/*
            * ONE BUTTON PER UNBROKEN RUN OF FREE TIME.
            *
            * A free afternoon is one press here, not four — which is the whole
            * reason the list exists beside the grid. The grid is the precise
            * instrument; this is the quick one.
            *
            * IT CANNOT SPAN A BOOKING. Adjacency is exact timestamp equality, so
            * an hour somebody has already taken leaves a gap the merge stops at.
            * The times shown are therefore always times that can actually be
            * booked, end to end.
            */}
          <div className="flex flex-wrap gap-2">
            {mergeSlotsIntoBlocks(day.slots).map((block) => {
              const chosen = block.slotStarts.filter((start) => selected.includes(start));
              const isOn = chosen.length > 0;
              const isWhole = chosen.length === block.slotStarts.length;

              return (
                <button
                  key={block.startsAt}
                  type="button"
                  /* A block that is wholly on clears; anything else fills. Two
                     presses always return you to where you started. */
                  onClick={() => onToggleBlock(block.slotStarts, !isWhole)}
                  aria-pressed={isOn}
                  aria-label={
                    isOn && !isWhole
                      ? `${formatSlotRange(block.startsAt, block.endsAt)}, partly selected`
                      : formatSlotRange(block.startsAt, block.endsAt)
                  }
                  className={cn(
                    'rounded-md border px-3 py-2 text-label-sm transition-colors',
                    'focus-visible:ring-brand/35 focus-visible:ring-4 focus-visible:outline-none',
                    isWhole
                      ? 'border-brand bg-brand text-white'
                      : isOn
                        ? /* Part of it came from the grid. Tinted rather than
                             filled, so the two states are not the same shape. */
                        'border-brand bg-brand-fixed text-brand'
                        : 'border-outline-variant/60 hover:bg-brand-fixed/60 bg-white',
                  )}
                >
                  {isOn ? (
                    <Check className="mr-1 inline size-3.5" aria-hidden="true" />
                  ) : null}
                  {formatSlotRange(block.startsAt, block.endsAt)}
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
            Load more
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

/** Fifteen minutes. The picker offers hours; trimming is finer than that. */
const STEP_SECONDS = 900;

/** The shortest session worth booking, and the floor every trim clamps to. */
const MIN_SESSION_MS = 15 * 60_000;

/** One session in the fine-tune panel: its run, and its trimmed hours. */
type TunedSession = { run: SelectedRun; startsAt: string; endsAt: string };

/**
 * The combined length of everything about to be booked.
 *
 * @param sessions - The sessions in the panel.
 * @returns The total, in the same words formatDuration uses.
 */
function totalDuration(sessions: TunedSession[]): string {
  const minutes = sessions.reduce(
    (sum, session) =>
      sum + (new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60_000,
    0,
  );

  const base = new Date(0).toISOString();

  return formatDuration(base, new Date(minutes * 60_000).toISOString());
}

/**
 * Moves a session's start, keeping it inside its run and behind its own end.
 *
 * CLAMPED RATHER THAN REJECTED. A time input hands over whatever is in it,
 * including a half-typed hour, and a change that would put the start after the
 * end used to be written through unchanged — leaving the panel showing a
 * negative session and the form submitting one the database would refuse.
 *
 * @param session - The session being trimmed.
 * @param value   - `HH:mm` from the input.
 * @returns The new hours, always a valid interval inside the run.
 */
function trimStart(session: TunedSession, value: string): { startsAt: string; endsAt: string } {
  const runStart = new Date(session.run.startsAt).getTime();
  const end = new Date(session.endsAt).getTime();
  const wanted = new Date(withCampusTime(session.run.startsAt, value)).getTime();

  const startsAt = new Date(
    Math.min(Math.max(wanted, runStart), end - MIN_SESSION_MS),
  ).toISOString();

  return { startsAt, endsAt: session.endsAt };
}

/**
 * Moves a session's end, keeping it inside its run and ahead of its own start.
 *
 * @param session - The session being trimmed.
 * @param value   - `HH:mm` from the input.
 * @returns The new hours, always a valid interval inside the run.
 */
function trimEnd(session: TunedSession, value: string): { startsAt: string; endsAt: string } {
  const runEnd = new Date(session.run.endsAt).getTime();
  const start = new Date(session.startsAt).getTime();
  /* Anchored to the run's END day, so a block that crosses midnight trims
     against the day it actually finishes on. */
  const wanted = new Date(withCampusTime(session.run.endsAt, value)).getTime();

  const endsAt = new Date(
    Math.max(Math.min(wanted, runEnd), start + MIN_SESSION_MS),
  ).toISOString();

  return { startsAt: session.startsAt, endsAt };
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
  sessions: TunedSession[];
  onChange: (id: string, next: { startsAt: string; endsAt: string }) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="border-outline-variant/30 bg-surface-container-high/40 shadow-clay flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-center justify-between">
        {/* The heading carries the total, so the length being booked is on
            screen whether or not the panel is open for editing. */}
        <p className="text-label-sm font-semibold">
          {sessions.length === 1
            ? `Session hours · ${formatDuration(sessions[0].startsAt, sessions[0].endsAt)}`
            : `${sessions.length} sessions · ${totalDuration(sessions)} in total`}
        </p>
        <button
          type="button"
          onClick={() => setIsEditing(!isEditing)}
          className="text-brand hover:brightness-110 text-label-sm font-medium transition-all"
        >
          {isEditing ? 'Done' : 'Edit times'}
        </button>
      </div>

      {sessions.map((session) => {
        const startId = `tune-start-${session.run.id}`;
        const endId = `tune-end-${session.run.id}`;

        return (
          <div key={session.run.id} className="flex flex-wrap items-center gap-3">
            <span
              suppressHydrationWarning
              className="text-on-surface-variant min-w-28 text-label-sm"
            >
              {new Date(session.run.startsAt).toLocaleDateString('en-US', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
            </span>

            {isEditing ? (
              <div className="flex items-center gap-2">
                <Label htmlFor={startId} className="sr-only">
                  Start
                </Label>
                <input
                  id={startId}
                  type="time"
                  value={campusTimeValue(session.startsAt)}
                  /*
                   * BOUNDED BY THE RUN, NOT BY THE OTHER INPUT. These used to
                   * read `max={session.endsAt}` and `min={session.startsAt}` —
                   * each input bounded by the value the other one was currently
                   * showing — so every keystroke moved the other field's limits
                   * and a half-typed hour could put the pair somewhere neither
                   * of them agreed with. The run's own edges do not move.
                   */
                  min={campusTimeValue(session.run.startsAt)}
                  max={campusTimeValue(session.run.endsAt)}
                  step={STEP_SECONDS}
                  onChange={(event) => onChange(session.run.id, trimStart(session, event.target.value))}
                  className="border-outline-variant bg-surface rounded-md border px-2.5 py-1.5 text-sm"
                />
                <span className="text-outline">–</span>
                <Label htmlFor={endId} className="sr-only">
                  End
                </Label>
                <input
                  id={endId}
                  type="time"
                  value={campusTimeValue(session.endsAt)}
                  min={campusTimeValue(session.run.startsAt)}
                  max={campusTimeValue(session.run.endsAt)}
                  step={STEP_SECONDS}
                  onChange={(event) => onChange(session.run.id, trimEnd(session, event.target.value))}
                  className="border-outline-variant bg-surface rounded-md border px-2.5 py-1.5 text-sm"
                />
              </div>
            ) : (
              <span className="flex items-baseline gap-2">
                <span className="text-on-surface text-label-sm font-medium">
                  {campusTimeValue(session.startsAt)} – {campusTimeValue(session.endsAt)}
                </span>
                <span className="text-outline text-[11px] font-normal">
                  {formatDuration(session.startsAt, session.endsAt)}
                  {session.startsAt !== session.run.startsAt ||
                    session.endsAt !== session.run.endsAt
                    ? ` of ${formatDuration(session.run.startsAt, session.run.endsAt)} free`
                    : null}
                </span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}