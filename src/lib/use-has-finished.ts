/**
 * File:        src/lib/use-has-finished.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Whether a session has ended, kept true as the clock passes it.
 *
 *              THE SERVER'S ANSWER IS RIGHT ONCE AND THEN GOES STALE. Every
 *              meeting view carries a `hasFinished` computed during the render
 *              that produced it, which is what keeps the first paint free of
 *              hydration mismatches — the reader's clock and the server's are
 *              not the same clock, and deriving it during render would make the
 *              two disagree. The cost is that the value never changes again: a
 *              student sitting on an open chat while their session ends went on
 *              being shown a live session with RSVP buttons, and never saw the
 *              "this has finished" state at all, because nothing re-rendered.
 *
 *              ONE TIMER TO THE EXACT MOMENT, not a poll. The end time is known,
 *              so the interesting instant is known too — a `setTimeout` sized to
 *              it costs nothing while waiting and fires once. Polling every
 *              minute would do the same job while waking the tab sixty times an
 *              hour to answer "not yet".
 *
 *              SEEDED FROM THE SERVER so the first render matches the HTML, then
 *              free to move. It only ever moves one way: a session that has
 *              finished does not un-finish, so there is no timer once it is true.
 * Version:     0.53.0
 *
 * Modifications:
 *     0.53.0 - 2026-08-25 - Initial implementation
 */

'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks whether a session has ended.
 *
 * @param endsAt  - When it ends, as an ISO instant.
 * @param initial - What the server decided, for the first paint.
 * @returns Whether it has finished, updating when the clock reaches endsAt.
 */
export function useHasFinished(endsAt: string, initial: boolean): boolean {
  const [finished, setFinished] = useState(initial);

  useEffect(() => {
    if (finished) {
      return;
    }

    /*
     * Always a timer, never a synchronous setState — including when the end is
     * already behind us, which happens whenever a cached render is opened after
     * the session ended. A zero-delay timeout still defers past this render, so
     * the effect cannot cascade.
     */
    const remaining = new Date(endsAt).getTime() - Date.now();
    const timer = setTimeout(() => setFinished(true), Math.max(0, remaining));

    return () => clearTimeout(timer);
  }, [endsAt, finished]);

  return finished;
}
