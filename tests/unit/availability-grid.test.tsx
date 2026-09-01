/**
 * File:        tests/unit/availability-grid.test.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The day headings, and the promise they make: a bulk press never
 *              costs the student a selection they cannot get back.
 *
 *              THE UNDO IS THE WHOLE TEST FILE. Filling a column is trivial to
 *              write and trivial to get right; what is easy to get wrong is the
 *              second press, and there are three different right answers
 *              depending on how the column got to be full. A day filled BY a
 *              press goes back to what it replaced, a day that was already full
 *              is cleared, and a day the student has since edited by hand keeps
 *              the edit. Each of those is a case below.
 *
 *              The grid holds its own selection and emits hidden inputs, so the
 *              form contract is asserted through those rather than by reaching
 *              into state.
 * Version:     1.1.0
 *
 * Modifications:
 *     1.1.0 - 2026-09-01 - Initial tests (day headings)
 */

import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AvailabilityGrid } from '@/components/onboarding/availability-grid';
import { TIME_SLOTS } from '@/config/onboarding';

/** Every slot key of one weekday, in row order. */
function keysFor(day: number): string[] {
  return TIME_SLOTS.map((slot) => `${day}|${slot.start}|${slot.end}`);
}

const SUNDAY = keysFor(0);
const TUESDAY = keysFor(2);

/** The seven cells of one column, top to bottom. */
function cellsOf(dayLabel: string): HTMLElement[] {
  return screen.getAllByRole('button', { name: new RegExp(`^${dayLabel} `) });
}

/** Which rows of a column are currently chosen. */
function chosenIn(dayLabel: string): string[] {
  return cellsOf(dayLabel)
    .filter((cell) => cell.getAttribute('aria-pressed') === 'true')
    .map((cell) => cell.getAttribute('aria-label') ?? '');
}

/** The day heading, whatever it currently says it does. */
function heading(dayLabel: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`\\b${dayLabel}$`) });
}

/** What the surrounding <form> would submit. */
function submitted(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('input[name="slots"]'))
    .map((input) => (input as HTMLInputElement).value)
    .sort();
}

describe('a day heading fills its column', () => {
  it('selects the whole day, and says so before it is pressed', async () => {
    const user = userEvent.setup();
    render(<AvailabilityGrid defaultSelected={[]} />);

    expect(heading('Sunday')).toHaveAccessibleName('Select every hour on Sunday');

    await user.click(heading('Sunday'));

    expect(chosenIn('Sunday')).toHaveLength(TIME_SLOTS.length);
  });

  it('leaves every other day alone', async () => {
    const user = userEvent.setup();
    render(<AvailabilityGrid defaultSelected={[TUESDAY[3]]} />);

    await user.click(heading('Sunday'));

    /* Tuesday keeps exactly what it had — a bulk action on one column that
       reaches into another is the worst version of this feature. */
    expect(chosenIn('Tuesday')).toEqual(['Tuesday 14–16']);
  });

  it('carries the selection to the form as hidden inputs', async () => {
    const user = userEvent.setup();
    const { container } = render(<AvailabilityGrid defaultSelected={[]} />);

    await user.click(heading('Sunday'));

    expect(submitted(container)).toEqual([...SUNDAY].sort());
  });
});

describe('pressing a heading twice puts the day back', () => {
  it('restores the hours a fill replaced', async () => {
    const user = userEvent.setup();
    /* Two hand-picked hours: the selection a careless bulk toggle would eat. */
    render(<AvailabilityGrid defaultSelected={[SUNDAY[0], SUNDAY[5]]} />);

    await user.click(heading('Sunday'));
    expect(chosenIn('Sunday')).toHaveLength(TIME_SLOTS.length);

    await user.click(heading('Sunday'));

    expect(chosenIn('Sunday')).toEqual(['Sunday 08–10', 'Sunday 18–20']);
  });

  it('names the second press as the undo it is', async () => {
    const user = userEvent.setup();
    render(<AvailabilityGrid defaultSelected={[SUNDAY[0]]} />);

    await user.click(heading('Sunday'));

    expect(heading('Sunday')).toHaveAccessibleName('Undo selecting the whole of Sunday');
  });

  it('starts a fresh pair each time, so the cycle never runs out', async () => {
    const user = userEvent.setup();
    render(<AvailabilityGrid defaultSelected={[SUNDAY[0]]} />);

    for (let round = 0; round < 3; round += 1) {
      await user.click(heading('Sunday'));
      expect(chosenIn('Sunday')).toHaveLength(TIME_SLOTS.length);

      await user.click(heading('Sunday'));
      expect(chosenIn('Sunday')).toEqual(['Sunday 08–10']);
    }
  });
});

describe('a day that was already full', () => {
  it('clears on the first press and comes back on the second', async () => {
    const user = userEvent.setup();
    /* Saved full, and never bulk-toggled in this session — the case where a
       press has no fill to undo, so it has to mean something else. */
    render(<AvailabilityGrid defaultSelected={SUNDAY} />);

    expect(heading('Sunday')).toHaveAccessibleName('Clear every hour on Sunday');

    await user.click(heading('Sunday'));
    expect(chosenIn('Sunday')).toEqual([]);

    await user.click(heading('Sunday'));
    expect(chosenIn('Sunday')).toHaveLength(TIME_SLOTS.length);
  });

  it('does not take the rest of the week with it', async () => {
    const user = userEvent.setup();
    render(<AvailabilityGrid defaultSelected={[...SUNDAY, ...TUESDAY]} />);

    await user.click(heading('Sunday'));

    expect(chosenIn('Tuesday')).toHaveLength(TIME_SLOTS.length);
  });
});

describe('a hand-picked cell ends that day\'s cycle', () => {
  it('does not revert the edit on the next press', async () => {
    const user = userEvent.setup();
    render(<AvailabilityGrid defaultSelected={[SUNDAY[0]]} />);

    /* Fill it, then take one hour back out by hand. */
    await user.click(heading('Sunday'));
    await user.click(screen.getByRole('button', { name: 'Sunday 12–14' }));

    expect(chosenIn('Sunday')).toHaveLength(TIME_SLOTS.length - 1);

    /*
     * THE TRAP. A remembered state that survives a hand edit describes a week
     * that no longer exists, so this press would silently throw the edit away
     * and drop back to the single hour. It has to fill instead.
     */
    await user.click(heading('Sunday'));
    expect(chosenIn('Sunday')).toHaveLength(TIME_SLOTS.length);

    /* And the pair that starts here undoes to the edited day, not the old one. */
    await user.click(heading('Sunday'));
    expect(chosenIn('Sunday')).toHaveLength(TIME_SLOTS.length - 1);
  });

  it('leaves the heading offering a fill again', async () => {
    const user = userEvent.setup();
    render(<AvailabilityGrid defaultSelected={SUNDAY} />);

    await user.click(screen.getByRole('button', { name: 'Sunday 12–14' }));

    expect(heading('Sunday')).toHaveAccessibleName('Select every hour on Sunday');
  });
});

describe('hovering a heading previews the fill', () => {
  /** The preview tint, as an exact class token rather than a substring. */
  const previewed = (cell: HTMLElement) => cell.classList.contains('bg-brand-fixed/60');

  it('tints the hours a press would add, and only those', () => {
    render(<AvailabilityGrid defaultSelected={[SUNDAY[0], TUESDAY[0]]} />);

    fireEvent.pointerEnter(heading('Sunday'), { pointerType: 'mouse' });

    const sunday = cellsOf('Sunday');

    /* Already chosen: no preview, because nothing about it would change. */
    expect(previewed(sunday[0])).toBe(false);
    expect(sunday.slice(1).every(previewed)).toBe(true);

    /* And the preview stays in its own column. */
    expect(cellsOf('Tuesday').some(previewed)).toBe(false);
  });

  it('clears when the pointer leaves', () => {
    render(<AvailabilityGrid defaultSelected={[]} />);

    fireEvent.pointerEnter(heading('Sunday'), { pointerType: 'mouse' });
    fireEvent.pointerLeave(heading('Sunday'));

    expect(cellsOf('Sunday').some(previewed)).toBe(false);
  });

  it('ignores a touch, which has no hover to speak of', () => {
    render(<AvailabilityGrid defaultSelected={[]} />);

    /*
     * A tap fires the pointer events too. Without the pointerType check the
     * column would sit there highlighted after the finger had gone, explaining
     * nothing to nobody.
     */
    fireEvent.pointerEnter(heading('Sunday'), { pointerType: 'touch' });

    expect(cellsOf('Sunday').some(previewed)).toBe(false);
  });
});
