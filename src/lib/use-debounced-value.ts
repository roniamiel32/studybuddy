/**
 * File:        src/lib/use-debounced-value.ts
 * Authors:     Roni Amiel & Eden Bitran
 * Description: Holds a value still until the user stops changing it.
 *
 *              Used by the course search inputs. The input itself stays
 *              controlled and updates on every keystroke — a debounced input
 *              value would make the field visibly lag behind typing, which reads
 *              as a broken keyboard. Only the DERIVED value that drives filtering
 *              is delayed.
 * Version:     0.43.0
 *
 * Modifications:
 *     0.43.0 - 2026-08-17 - Initial implementation (course search)
 */

'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `value` after it has stopped changing for `delayMs`.
 *
 * @param value   - The value to follow.
 * @param delayMs - How long it must hold still. 500ms by default.
 * @returns The settled value.
 */
export function useDebouncedValue<T>(value: T, delayMs = 500): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    /*
     * Cleared and re-armed on every change, so the timer only fires once the
     * value has been quiet for the full delay rather than once per keystroke.
     */
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
}
