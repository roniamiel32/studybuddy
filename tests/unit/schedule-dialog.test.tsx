/**
 * File:        tests/unit/schedule-dialog.test.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Phase 9H — the picker's two views, and the selection they share.
 *
 *              THE TEST THAT MATTERS MOST asserts what is NOT a button. "Grey
 *              and read-only" is easy to fake with a disabled control, and a
 *              disabled control is still an element a screen reader announces
 *              and a keyboard user may land on — a week with forty unavailable
 *              cells becomes forty stops on the way to the one free Thursday.
 *              Counting the buttons is what pins that down.
 *
 *              THE OTHER ONE IS THE TOGGLE. Selection is held above both views
 *              precisely so that switching is a change of lens; a test that only
 *              checked each view in isolation would pass against an
 *              implementation that quietly reset the picks on every switch,
 *              which is the exact bug the shared state exists to prevent.
 *
 *              findMeetingSlots is mocked. It is a 'use server' module that
 *              opens a Supabase client from cookies, and what is under test here
 *              is what the component does with an answer, not how it gets one.
 * Version:     0.49.0
 *
 * Modifications:
 *     0.53.0 - 2026-08-25 - A list block selects every slot it covers, and the
 *                           panel names the real duration
 *     0.49.0 - 2026-08-19 - The list's "Load more" no longer counts the days it
 *                           is holding back
 *     0.48.0 - 2026-08-19 - Fixtures anchored on the week's Sunday, matching the
 *                           grid; the title assertion names the partner
 *     0.30.0 - 2026-08-14 - Initial tests (Phase 9H)
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MeetingSlotView } from '@/features/meetings/meeting-view';

/**
 * A slot on a weekday of THE CURRENT WEEK, in the reader's own zone.
 *
 * ANCHORED ON SUNDAY RATHER THAN ON TODAY, and that is what stops the calendar
 * deciding whether this suite passes. buildSlotGrid draws Sunday to Saturday of
 * the week it is called in, so fixtures written as "today plus four days" fall
 * off the end of the grid from Wednesday onwards — the run would find three
 * cells where it expected five, on three days out of seven. Written as weekdays,
 * every fixture lands in the window whatever day the suite runs on.
 *
 * @param dayOfWeek - 0 = Sunday, the numbering the grid uses.
 * @param hour      - Local start hour.
 * @returns The slot.
 */
function slotAt(dayOfWeek: number, hour: number): MeetingSlotView {
  const now = new Date();
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const start = new Date(
    sunday.getFullYear(),
    sunday.getMonth(),
    sunday.getDate() + dayOfWeek,
    hour,
  );

  return {
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 7_200_000).toISOString(),
    participantCount: 2,
  };
}

/* Sunday 14–16 and 16–18, and 14–16 on Tuesday, Thursday and Saturday.
   Deliberately lopsided: a grid that filled every cell would hide a bug that
   ignores the day. */
const SLOTS = [slotAt(0, 14), slotAt(0, 16), slotAt(2, 14), slotAt(4, 14), slotAt(6, 14)];

const findMeetingSlots = vi.fn(async () => ({ ok: true as const, data: SLOTS }));
const createMeeting = vi.fn(async () => ({ ok: true as const, data: undefined }));

vi.mock('@/features/meetings/actions', () => ({
  findMeetingSlots: (...args: unknown[]) => findMeetingSlots(...(args as [])),
  createMeeting: (...args: unknown[]) => createMeeting(...(args as [])),
}));

const { ScheduleMeetingDialog } = await import(
  '@/components/meetings/schedule-meeting-dialog'
);

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  findMeetingSlots.mockResolvedValue({ ok: true, data: SLOTS });
});

/**
 * Renders the picker open and waits for the slots to land.
 *
 * @returns The user-event instance.
 */
async function openPicker() {
  const user = userEvent.setup();

  render(
    <ScheduleMeetingDialog
      open
      onClose={() => {}}
      conversationId="11111111-1111-4111-8111-111111111111"
      withLabel="Pat Partner"
    />,
  );

  await screen.findByRole('table');

  return user;
}

/** The grid's own selectable cells, excluding the toggle and the footer. */
function gridCells() {
  return within(screen.getByRole('table')).getAllByRole('button');
}

describe('the picker opens on the grid', () => {
  it('asks for exactly one week', async () => {
    await openPicker();

    expect(findMeetingSlots).toHaveBeenCalledWith(
      expect.objectContaining({ days: 7 }),
    );
  });

  it('shows a table rather than the list', async () => {
    await openPicker();

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('gives every day in the window a column', async () => {
    await openPicker();

    /* Seven days plus the empty corner above the row headings. */
    expect(within(screen.getByRole('table')).getAllByRole('columnheader')).toHaveLength(8);
  });

  it('offers a nameless default title', async () => {
    await openPicker();

    const title = screen.getByLabelText('What is it for?');

    /*
     * No partner name and no course code. The form is already inside the chat
     * with the person, and this string is what lands on the row — which both
     * people read. The name is added per recipient by the calendar sync.
     */
    expect(title).toHaveValue('Study session');
  });

  it('makes unavailable cells not controls at all', async () => {
    await openPicker();

    /*
     * Five offered slots across a 7-day, 7-row grid: forty-nine cells, five of
     * which are selectable. The other forty-four must not be buttons — not
     * disabled buttons, not buttons at all.
     */
    expect(gridCells()).toHaveLength(SLOTS.length);
    expect(
      gridCells().every((cell) => cell.getAttribute('aria-pressed') === 'false'),
    ).toBe(true);
  });
});

describe('selecting times', () => {
  it('selects a slot, and unselects it again', async () => {
    const user = await openPicker();
    const [first] = gridCells();

    await user.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'true');

    await user.click(first);
    expect(first).toHaveAttribute('aria-pressed', 'false');
  });

  it('holds several at once', async () => {
    const user = await openPicker();
    const cells = gridCells();

    await user.click(cells[0]);
    await user.click(cells[2]);

    expect(cells[0]).toHaveAttribute('aria-pressed', 'true');
    expect(cells[2]).toHaveAttribute('aria-pressed', 'true');
    expect(cells[1]).toHaveAttribute('aria-pressed', 'false');
  });

  it('says how many sessions two separate days will book', async () => {
    const user = await openPicker();
    const cells = gridCells();

    /* Sunday 14–16 and Thursday 14–16: two days, so two sessions. */
    await user.click(cells[0]);
    await user.click(cells[2]);

    expect(
      screen.getByRole('button', { name: /Schedule 2 sessions/ }),
    ).toBeInTheDocument();
  });

  it('merges two touching blocks into one session', async () => {
    const user = await openPicker();
    const cells = gridCells();

    /*
     * The grid renders row-major — the whole 14:00 row across the days it is
     * free on, then the 16:00 row — so Sunday's two contiguous blocks are the
     * first cell and the last, not two neighbours. Being contiguous, they book
     * one session rather than two.
     */
    await user.click(cells[0]);
    await user.click(cells.at(-1)!);

    expect(screen.getByRole('button', { name: /Schedule it/ })).toBeInTheDocument();
    /*
     * One session, and the heading now says how long it is. The duration is the
     * assertion with teeth: the panel used to say "Session hours" while the
     * block above it advertised a different length entirely, and a heading that
     * names the real 14:00–18:00 total is what closes that gap.
     */
    expect(screen.getByText('Session hours · 4h')).toBeInTheDocument();
  });

  it('will not submit with nothing picked', async () => {
    await openPicker();

    expect(screen.getByRole('button', { name: /Schedule it/ })).toBeDisabled();
    expect(screen.getByText('Pick a time first')).toBeInTheDocument();
  });
});

describe('the list view', () => {
  it('replaces the grid when toggled, and comes back', async () => {
    const user = await openPicker();

    await user.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Grid' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('keeps the selection across a switch of view', async () => {
    /*
     * The reason selection lives above both views. An implementation that reset
     * on switch would pass every other test in this file.
     */
    const user = await openPicker();

    await user.click(gridCells()[0]);
    await user.click(screen.getByRole('button', { name: 'List' }));

    expect(
      screen.getAllByRole('button', { pressed: true }).filter((button) =>
        /\d{2}:\d{2} – \d{2}:\d{2}/.test(button.textContent ?? ''),
      ),
    ).toHaveLength(1);
  });

  it('supports multi-selection of its own', async () => {
    const user = await openPicker();

    await user.click(screen.getByRole('button', { name: 'List' }));

    const times = screen
      .getAllByRole('button')
      .filter((button) => /\d{2}:\d{2} – \d{2}:\d{2}/.test(button.textContent ?? ''));

    await user.click(times[0]);
    await user.click(times[1]);

    expect(times[0]).toHaveAttribute('aria-pressed', 'true');
    expect(times[1]).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows one button per grid cell, not merged runs', async () => {
    /*
     * THE DESYNC THIS REPLACED. The list used to merge contiguous slots into one
     * button, so Sunday's 14–16 and 16–18 appeared as a single "14:00 – 18:00"
     * while the grid drew two separate cells. Whichever view a student read
     * second contradicted the first, with nothing to say which was the truth.
     */
    const user = await openPicker();

    const cellCount = gridCells().length;

    await user.click(screen.getByRole('button', { name: 'List' }));
    /* The list paginates by day; expand it so both views show the same week. */
    await user.click(screen.getByRole('button', { name: /Load more/ }));

    const times = screen
      .getAllByRole('button')
      .filter((button) => /\d{2}:\d{2} – \d{2}:\d{2}/.test(button.textContent ?? ''));

    expect(times).toHaveLength(cellCount);
  });

  it('books exactly the slot the button names', async () => {
    const user = await openPicker();

    await user.click(screen.getByRole('button', { name: 'List' }));

    const twoHours = screen
      .getAllByRole('button')
      .find((button) => /14:00 – 16:00/.test(button.textContent ?? ''))!;

    await user.click(twoHours);

    /* Two hours on the button, two hours in the panel. */
    expect(screen.getByText('Session hours · 2h')).toBeInTheDocument();
  });

  it('clears a slot on a second press', async () => {
    const user = await openPicker();

    await user.click(screen.getByRole('button', { name: 'List' }));

    const slot = screen
      .getAllByRole('button')
      .find((button) => /14:00 – 16:00/.test(button.textContent ?? ''))!;

    await user.click(slot);
    await user.click(slot);

    expect(screen.getByRole('button', { name: /Schedule it/ })).toBeDisabled();
    expect(screen.getByText('Pick a time first')).toBeInTheDocument();
  });

  it('shows three days, then loads the rest, then folds back', async () => {
    const user = await openPicker();

    await user.click(screen.getByRole('button', { name: 'List' }));

    /* Four days have slots; three are shown, so one is held back. The button
       used to count what was left — "Load more (1 more day)" — and now just
       says "Load more", so the count is no longer what is asserted. */
    const loadMore = screen.getByRole('button', { name: /Load more/ });
    expect(screen.queryByRole('button', { name: 'Load less' })).not.toBeInTheDocument();

    await user.click(loadMore);

    expect(screen.queryByRole('button', { name: /Load more/ })).not.toBeInTheDocument();
    const loadLess = screen.getByRole('button', { name: 'Load less' });

    await user.click(loadLess);

    expect(screen.getByRole('button', { name: /Load more/ })).toBeInTheDocument();
  });
});

describe('when there is nothing to offer', () => {
  it('says so instead of drawing an empty grid', async () => {
    findMeetingSlots.mockResolvedValue({ ok: true, data: [] });

    render(
      <ScheduleMeetingDialog
        open
        onClose={() => {}}
        conversationId="11111111-1111-4111-8111-111111111111"
        withLabel="Pat Partner"
      />,
    );

    expect(await screen.findByText(/No shared free time/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('reports a failure to load rather than an empty week', async () => {
    findMeetingSlots.mockResolvedValue({
      ok: false,
      error: { message: 'We could not read that chat’s free time.' },
    } as never);

    render(
      <ScheduleMeetingDialog
        open
        onClose={() => {}}
        conversationId="11111111-1111-4111-8111-111111111111"
        withLabel="Pat Partner"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('could not read');
    });
  });
});
