/**
 * True once the trend pane has actually drawn something.
 *
 * This exists because the boot overlay's progress has to be earned. Two of its
 * milestones are already true the moment it mounts, the fleet being defined in
 * code and the history seeded, so without a later fact there is nothing left for
 * a bar to report and it would open part filled and jump. Charts finishing their
 * paint is the one genuinely subsequent event in the boot, measured 90 to 110 ms
 * after the overlay appears.
 *
 * It watches for a rendered path inside the caller's own element rather than for
 * a chart library's class name, so nothing here breaks when that library renames
 * its internals. Under a DOM that never paints, jsdom included, it simply stays
 * false and the bar reports one milestone fewer, which is the honest answer
 * there.
 */

import { useEffect, useState, type RefObject } from 'react';

export function useChartsPainted(ref: RefObject<HTMLElement | null>, active: boolean): boolean {
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    if (!active || painted) return;

    let frame = requestAnimationFrame(function look() {
      if (ref.current?.querySelector('path')) {
        setPainted(true);
        return;
      }
      frame = requestAnimationFrame(look);
    });

    return () => cancelAnimationFrame(frame);
  }, [ref, active, painted]);

  return painted;
}
