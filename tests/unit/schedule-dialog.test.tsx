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
 * Version:     0.30.0
 *
 * Modifications:
 *     0.30.0 - 2026-08-14 - Initial tests (Phase 9H)
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { MeetingSlotView } from '@/features/meetings/meeting-view';

/** Built from local components, because the picker renders in the reader's zone. */
function slotAt(daysAhead: number, hour: number): MeetingSlotView {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead, hour);

  return {
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 7_200_000).toISOString(),
    participantCount: 2,
  };
}

/* Today 14–16 and 16–18, and 14–16 on three later days. Deliberately lopsided:
   a grid that filled every cell would hide a bug that ignores the day. */
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
      courseCode="CS-3040"
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

  it('makes unavailable cells not controls at all', async () => {
    await openPicker();

    /*
     * Five offered slots across a 7-day, 2-row grid: fourteen cells, five of
     * which are selectable. The other nine must not be buttons — not disabled
     * buttons, not buttons at all.
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

    /* Today 14–16 and a different day's 14–16: two days, so two sessions. */
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
     * The grid renders row-major — a whole 14:00 row across the days it is free
     * on, then the 16:00 row — so today's two contiguous blocks are the first
     * cell and the last, not two neighbours. Being contiguous, they book one
     * session rather than two.
     */
    await user.click(cells[0]);
    await user.click(cells.at(-1)!);

    expect(screen.getByRole('button', { name: /Schedule it/ })).toBeInTheDocument();
    expect(screen.getByText('Fine-tune session hours')).toBeInTheDocument();
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

  it('shows three days, then loads the rest, then folds back', async () => {
    const user = await openPicker();

    await user.click(screen.getByRole('button', { name: 'List' }));

    /* Four days have slots; three are shown, so one is held back. */
    const loadMore = screen.getByRole('button', { name: /Load more \(1 more day\)/ });
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
        courseCode="CS-3040"
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
        courseCode="CS-3040"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('could not read');
    });
  });
});
