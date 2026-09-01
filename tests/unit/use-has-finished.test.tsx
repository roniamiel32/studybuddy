/**
 * File:        tests/unit/use-has-finished.test.tsx
 * Authors:     Roni Amiel & Eden Bitran
 * Description: The timer that carries a session from "on" to "finished".
 *
 *              THE OVERFLOW IS WHY THIS FILE EXISTS. setTimeout holds its delay
 *              in a signed 32-bit integer, so a session more than about 24.8
 *              days away asked it to wait longer than it can count and the
 *              callback ran on the next tick instead. Weekly series book eight
 *              weeks ahead, and every sitting past the first month came back
 *              saying it had already happened — no RSVP buttons, no way to call
 *              it off, and "You attended this session." about a Tuesday in
 *              October. It is the kind of bug that cannot be found by looking at
 *              the component, because the component is correct.
 *
 *              Time is driven by fake timers rather than waited out, for the
 *              obvious reason.
 * Version:     0.54.0
 *
 * Modifications:
 *     0.54.0 - 2026-09-01 - Initial tests (timer overflow on a distant session)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import { useHasFinished } from '@/lib/use-has-finished';

/** The largest delay setTimeout can hold — 24.8 days. */
const MAX_TIMEOUT_MS = 2_147_483_647;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Renders the hook's answer as text, which is all the assertions need. */
function Probe({ endsAt, initial }: { endsAt: string; initial: boolean }) {
  return <span>{useHasFinished(endsAt, initial) ? 'finished' : 'running'}</span>;
}

/**
 * Renders the probe for a session ending `inMs` from now.
 *
 * @param inMs - How far ahead it ends. Negative for one already over.
 * @returns Nothing; assertions read the screen.
 */
function renderEndingIn(inMs: number) {
  render(<Probe endsAt={new Date(Date.now() + inMs).toISOString()} initial={false} />);
}

describe('useHasFinished', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T09:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds a session open until its end, then closes it', () => {
    renderEndingIn(30 * MINUTE_MS);

    expect(screen.getByText('running')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(30 * MINUTE_MS + 1);
    });

    expect(screen.getByText('finished')).toBeInTheDocument();
  });

  it('does not declare a session six weeks out to be over', () => {
    /*
     * THE REGRESSION. 42 days is past what setTimeout can express, and the
     * unclamped version fired on the very next tick — so an occurrence booked by
     * a weekly series was drawn as a session the student had already attended.
     */
    renderEndingIn(42 * DAY_MS);

    act(() => {
      vi.advanceTimersByTime(MAX_TIMEOUT_MS);
    });

    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('still gets there, in hops', () => {
    renderEndingIn(42 * DAY_MS);

    /* Two hops of the maximum clear 49 days, which is past the end. */
    act(() => {
      vi.advanceTimersByTime(MAX_TIMEOUT_MS);
    });
    act(() => {
      vi.advanceTimersByTime(MAX_TIMEOUT_MS);
    });

    expect(screen.getByText('finished')).toBeInTheDocument();
  });

  it('closes a session that was already over when the page opened', () => {
    renderEndingIn(-MINUTE_MS);

    /* Deferred rather than synchronous, so the effect cannot cascade a render —
       which is why this needs a tick at all. */
    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByText('finished')).toBeInTheDocument();
  });

  it('takes the server at its word on the first paint', () => {
    /* Seeded, so the first render matches the HTML it hydrates. */
    render(
      <Probe endsAt={new Date(Date.now() + DAY_MS).toISOString()} initial={true} />,
    );

    expect(screen.getByText('finished')).toBeInTheDocument();
  });
});
