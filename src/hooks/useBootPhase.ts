/**
 * Lifetime of the boot overlay.
 *
 * The overlay leaves on a fact, not on a stopwatch: the caller passes `ready`,
 * which says the screen underneath has something real to show. Two bounds frame
 * that fact. A floor, because an overlay that appears and vanishes inside one
 * frame reads as a glitch rather than as a start. A ceiling, because an overlay
 * whose fact never arrives would otherwise sit on top of a working dashboard
 * forever; past the ceiling it leaves regardless, and whatever the screen says
 * about its data source is then the truth the visitor gets.
 *
 * Phases move in one direction only. Nothing here can put a dismissed overlay
 * back up, so a source change mid session cannot black out a running screen.
 */

import { useEffect, useState } from 'react';

/**
 * Shortest time the overlay stays up, so a fast boot does not flash it.
 *
 * Set from measurement on the production bundle rather than by taste. The
 * overlay mounts around 95 ms after navigation and its fact is already true at
 * that instant, the history being seeded; the trend charts finish painting
 * around 185 ms, some 90 ms later. 250 ms covers that paint with margin, so the
 * overlay never uncovers a half drawn screen, and it stays legible instead of
 * flashing: with no floor at all it is on screen for about 96 ms, measured.
 */
export const BOOT_FLOOR_MS = 250;

/** Longest the overlay can stay up, whatever the boot is doing. */
export const BOOT_CEILING_MS = 2500;

/** Fade out, matched by the duration class in BootOverlay. */
export const BOOT_FADE_MS = 300;

export type BootPhase = 'visible' | 'leaving' | 'gone';

/**
 * Guarded on purpose. jsdom does not implement matchMedia at all, and older
 * browsers do not implement this query, so an unguarded call would throw on the
 * first render rather than degrade.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useBootPhase(ready: boolean) {
  // Read once. A visitor flipping the system preference mid boot is not worth a
  // subscription, and re-reading would let the overlay change behaviour halfway.
  const [reducedMotion] = useState(prefersReducedMotion);

  // Under reduced motion there is no floor and no fade: the overlay is removed
  // as soon as the fact holds, with opacity as its only visual state.
  const floorMs = reducedMotion ? 0 : BOOT_FLOOR_MS;
  const fadeMs = reducedMotion ? 0 : BOOT_FADE_MS;

  const [floorElapsed, setFloorElapsed] = useState(() => floorMs === 0);
  const [expired, setExpired] = useState(false);
  const [phase, setPhase] = useState<BootPhase>('visible');

  useEffect(() => {
    if (floorMs === 0) return;
    const timer = setTimeout(() => setFloorElapsed(true), floorMs);
    return () => clearTimeout(timer);
  }, [floorMs]);

  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), BOOT_CEILING_MS);
    return () => clearTimeout(timer);
  }, []);

  // Deciding to leave and finishing the leaving are two effects on purpose. Held
  // together, the phase change this one causes would re-run the effect, and the
  // cleanup would clear the fade timer that same run had just armed: the overlay
  // would stop at `leaving` for good, invisible but never unmounted, holding
  // aria-busy true underneath it forever.
  useEffect(() => {
    if (phase !== 'visible') return;
    if (!expired && !(ready && floorElapsed)) return;
    setPhase(fadeMs === 0 ? 'gone' : 'leaving');
  }, [phase, ready, floorElapsed, expired, fadeMs]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = setTimeout(() => setPhase('gone'), fadeMs);
    return () => clearTimeout(timer);
  }, [phase, fadeMs]);

  return {
    phase,
    /** True while the overlay occupies the screen, fade included. */
    mounted: phase !== 'gone',
    leaving: phase === 'leaving',
    /** False when the visitor asked for no motion. */
    animated: !reducedMotion,
  };
}
