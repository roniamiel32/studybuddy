/**
 * File:        src/components/onboarding/availability-grid.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The weekly availability grid, on its own.
 *
 *              Extracted from onboarding step 4 so the Profile tab can edit the
 *              same week without a second copy of it. It owns the selection and
 *              emits one hidden input per selected slot, so any <form> can wrap
 *              it and any action can read `slots` the same way.
 *
 *              It deliberately knows nothing about how it is submitted: step 4
 *              finishes onboarding, the Profile tab saves and closes a dialog,
 *              and neither of those belongs to a grid of buttons.
 *
 *              A DAY HEADING IS A BUTTON, AND PRESSING IT NEVER LOSES WORK.
 *              Filling a week two hours at a time is forty-nine presses, so the
 *              headings fill a column in one — but a bulk action over somebody
 *              else's careful selection is exactly how an undo-less form eats an
 *              afternoon. So every press remembers what the day was, and pressing
 *              the same heading again puts it back. See toggleDay.
 * Version:     1.1.0
 *
 * Modifications:
 *     1.1.0  - 2026-09-01 - Day headings select a whole column, remember what
 *                           they replaced, and preview themselves on hover
 *     0.53.0 - 2026-08-25 - table-fixed, so every weekday column is equal
 *     0.19.0 - 2026-08-11 - Extracted from availability-form (Phase 4)
 */

'use client';

import { useState } from 'react';

import { Chip } from '@/components/ui/chip';
import { TIME_SLOTS, WEEKDAYS } from '@/config/onboarding';
import { cn } from '@/lib/utils';

export interface AvailabilityGridProps {
  /** Slots already saved, encoded as `day|start|end`. */
  defaultSelected: string[];
  /** Field name for the hidden inputs, repeated once per selected slot. */
  name?: string;
  /** Shown beside the hours chip while nothing is selected. */
  emptyHint?: string;
}

/**
 * Renders the tappable weekly grid and the hours it adds up to.
 *
 * @param defaultSelected - Previously saved slots.
 * @param name            - Field name carrying the selection to the action.
 * @param emptyHint       - What to say when the week is still empty.
 * @returns The grid element.
 */
export function AvailabilityGrid({
  defaultSelected,
  name = 'slots',
  emptyHint,
}: AvailabilityGridProps) {
  const [selected, setSelected] = useState<string[]>(defaultSelected);

  /*
   * What each day looked like before its heading was last pressed.
   *
   * THIS IS THE UNDO, and it is per day rather than global on purpose: pressing
   * Sunday and then Tuesday must leave both of them undoable, which a single
   * previous-state slot could not do. A day is only in here while its cycle is
   * open — the entry is dropped the moment the day is put back, or the moment
   * the student edits one of its cells by hand.
   */
  const [dayMemory, setDayMemory] = useState<Record<number, string[]>>({});

  /** The column the mouse is over, previewing what a press would add. */
  const [previewDay, setPreviewDay] = useState<number | null>(null);

  /**
   * Every slot key in one column.
   *
   * @param day - The weekday value.
   * @returns Its seven keys, in row order.
   */
  const keysForDay = (day: number) =>
    TIME_SLOTS.map((slot) => `${day}|${slot.start}|${slot.end}`);

  const toggle = (key: string, day: number) => {
    setSelected((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );

    /*
     * A hand-picked cell closes that day's cycle. The remembered state describes
     * a week that no longer exists, and putting it back would quietly undo the
     * edit the student just made — the one thing this whole mechanism is for.
     */
    setDayMemory((current) => {
      if (!(day in current)) {
        return current;
      }

      const next = { ...current };
      delete next[day];

      return next;
    });
  };

  /**
   * Fills a whole day, or puts it back the way it was.
   *
   * THE CYCLE, in the only three states a column can be in:
   *
   *   NOT FULL — fill it, and remember what was there. A student who had
   *   Tuesday evening picked and presses Tuesday gets the whole day, and one
   *   more press gives the evening back.
   *
   *   FULL, FILLED BY THE LAST PRESS — put back what the press replaced. This is
   *   the undo half of the pair above.
   *
   *   FULL, NOT BY US — clear it, remembering the full day. The next press
   *   restores it, because a full day and a fill are the same thing: pressing a
   *   full Sunday twice is a round trip, not a way to lose a Sunday.
   *
   * @param day - The weekday whose heading was pressed.
   * @returns Nothing.
   */
  const toggleDay = (day: number) => {
    const keys = keysForDay(day);
    const inDay = new Set<string>(keys);
    const onThisDay = selected.filter((key) => inDay.has(key));
    const otherDays = selected.filter((key) => !inDay.has(key));
    const isFull = onThisDay.length === keys.length;
    const remembered = dayMemory[day];

    if (isFull && remembered) {
      setSelected([...otherDays, ...remembered]);
      /* The pair is complete; the next press starts a new one. */
      setDayMemory((current) => {
        const next = { ...current };
        delete next[day];

        return next;
      });

      return;
    }

    /* Remembered before anything is written, in both remaining cases: it is the
       only record of what the press is about to replace. */
    setDayMemory((current) => ({ ...current, [day]: onThisDay }));
    setSelected(isFull ? otherDays : [...otherDays, ...keys]);
  };

  /**
   * What pressing a heading would do, said out loud for a screen reader.
   *
   * The control cycles, so a fixed label would be wrong half the time — and
   * "toggle" is not a promise anybody can act on when the answer is sometimes
   * "clear the day" and sometimes "give you back the two hours you had".
   *
   * @param day - The weekday value.
   * @returns The label.
   */
  const dayActionLabel = (day: (typeof WEEKDAYS)[number]) => {
    const keys = keysForDay(day.value);
    const chosen = selected.filter((key) => keys.includes(key)).length;

    if (chosen < keys.length) {
      return `Select every hour on ${day.label}`;
    }

    return dayMemory[day.value]
      ? `Undo selecting the whole of ${day.label}`
      : `Clear every hour on ${day.label}`;
  };

  const hours = selected.length * 2;

  return (
    <>
      {selected.map((slot) => (
        <input key={slot} type="hidden" name={name} value={slot} />
      ))}

      {/* Horizontal scroll on narrow screens rather than a cramped grid: seven
          columns cannot fit a phone legibly, and shrinking them makes the
          targets too small to tap accurately. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        {/*
          * table-fixed is what makes the seven day columns equal.
          *
          * Without it the browser uses automatic table layout, which sizes every
          * column to its own content — and the day headings are not the same
          * width, so Wednesday came out wider than Friday and the grid read as
          * skewed. Fixed layout gives the row-label column its declared w-16 and
          * splits the remainder evenly between the days, whatever is in them.
          */}
        <table className="w-full min-w-[34rem] table-fixed border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-16" />
              {WEEKDAYS.map((day) => (
                <th key={day.value} scope="col" className="pb-1">
                  {/*
                    * POINTER EVENTS RATHER THAN onMouseEnter, and the pointerType
                    * check is the reason. A tap on a touch screen also fires the
                    * mouse events, which would leave a column previewing itself
                    * long after the finger had gone — a highlight nothing on
                    * screen explains. This way the preview is what it says it is:
                    * a desktop hover.
                    */}
                  <button
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    onPointerEnter={(event) => {
                      if (event.pointerType === 'mouse') {
                        setPreviewDay(day.value);
                      }
                    }}
                    onPointerLeave={() => setPreviewDay(null)}
                    aria-label={dayActionLabel(day)}
                    className={cn(
                      'text-on-surface-variant w-full cursor-pointer rounded-sm py-1 text-label-sm',
                      'hover:text-brand transition-colors',
                      'focus-visible:ring-brand/35 focus-visible:ring-4 focus-visible:outline-none',
                    )}
                  >
                    {/* aria-hidden: the button's own label already says both the
                        day and what pressing it does, and the abbreviation would
                        otherwise be read as a second, contradictory name. */}
                    <abbr aria-hidden="true" title={day.label} className="no-underline">
                      {day.short}
                    </abbr>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIME_SLOTS.map((slot) => (
              <tr key={slot.start}>
                <th
                  scope="row"
                  className="text-outline pr-2 text-right text-label-sm font-normal"
                >
                  {slot.label}
                </th>
                {WEEKDAYS.map((day) => {
                  const key = `${day.value}|${slot.start}|${slot.end}`;
                  const isOn = selected.includes(key);
                  /* Only the cells a press would actually add. Tinting the ones
                     already chosen would preview a change that is not coming. */
                  const previewed = previewDay === day.value && !isOn;

                  return (
                    <td key={key}>
                      <button
                        type="button"
                        onClick={() => toggle(key, day.value)}
                        aria-pressed={isOn}
                        aria-label={`${day.label} ${slot.label}`}
                        className={cn(
                          'h-9 w-full rounded-sm border transition-colors',
                          'focus-visible:ring-brand/35 focus-visible:ring-4 focus-visible:outline-none',
                          isOn
                            ? 'border-brand bg-brand'
                            : 'border-outline-variant/50 bg-white hover:bg-brand-fixed/60',
                          previewed && 'border-brand/40 bg-brand-fixed/60',
                        )}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={hours > 0 ? 'brand' : 'neutral'}>{hours} hours a week</Chip>
        {hours === 0 && emptyHint ? (
          <span className="text-outline text-label-sm">{emptyHint}</span>
        ) : null}
      </div>
    </>
  );
}
