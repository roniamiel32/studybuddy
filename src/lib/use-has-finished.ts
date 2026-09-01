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
 *
 *              THE TIMER IS CHAINED, AND THAT IS NOT DEFENSIVE PROGRAMMING.
 *              setTimeout holds its delay in a signed 32-bit integer, so anything
 *              beyond about 24.8 days overflows and fires IMMEDIATELY — the exact
 *              opposite of waiting. See the note on MAX_TIMEOUT_MS.
 * Version:     0.54.0
 *
 * Modifications:
 *     0.54.0 - 2026-09-01 - Chain the timer, so a session further out than
 *                           setTimeout can express is not declared finished at
 *                           once
 *     0.53.0 - 2026-08-25 - Initial implementation
 */

'use client';

import { useEffect, useState } from 'react';

/**
 * The longest delay setTimeout can actually hold.
 *
 * WHAT THIS COSTS WHEN IGNORED, because it is not a theoretical limit. Delays are
 * stored as a signed 32-bit integer, and a larger one wraps to something small or
 * negative — so the callback runs on the next tick instead of in six weeks. Before
 * weekly series nothing could be booked further out than the picker's fortnight
 * and this was unreachable; a series books eight weeks, and half of its sittings
 * came back saying "this session has finished. You attended this session." with no
 * RSVP and no way to call them off.
 */
const MAX_TIMEOUT_MS = 2_147_483_647;

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

    let timer: ReturnType<typeof setTimeout>;

    /**
     * Waits for the end, in hops no longer than setTimeout can hold.
     *
     * @returns Nothing.
     */
    const wait = () => {
      const remaining = new Date(endsAt).getTime() - Date.now();

      /*
       * Always a timer, never a synchronous setState — including when the end is
       * already behind us, which happens whenever a cached render is opened after
       * the session ended. A zero-delay timeout still defers past this render, so
       * the effect cannot cascade.
       */
      timer =
        remaining <= 0
          ? setTimeout(() => setFinished(true), 0)
          : setTimeout(wait, Math.min(remaining, MAX_TIMEOUT_MS));
    };

    wait();

    return () => clearTimeout(timer);
  }, [endsAt, finished]);

  return finished;
}
