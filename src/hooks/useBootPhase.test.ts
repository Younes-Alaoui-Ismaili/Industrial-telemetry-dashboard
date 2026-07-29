import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBootPhase, BOOT_CEILING_MS, BOOT_FADE_MS, BOOT_FLOOR_MS } from './useBootPhase';

/** jsdom has no matchMedia, so a preference has to be stated explicitly. */
function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: reduce, media: '(prefers-reduced-motion: reduce)' }),
  );
}

/**
 * The two bounds are set independently, one for legibility and one as a guard,
 * so nothing but a test stops a later change to either from making the guard the
 * rule. Raising the floor past the ceiling would mean every boot hit the ceiling
 * and the fact the overlay waits on stopped mattering at all.
 */
describe('boot bounds', () => {
  it('keeps the ceiling clear of the nominal display time', () => {
    expect(BOOT_CEILING_MS).toBeGreaterThan(BOOT_FLOOR_MS + BOOT_FADE_MS);
  });
});

describe('useBootPhase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts visible', () => {
    const { result } = renderHook(() => useBootPhase(false));
    expect(result.current.phase).toBe('visible');
    expect(result.current.mounted).toBe(true);
  });

  /** The floor is what stops a fast boot reading as a glitch. */
  it('holds the floor even when the fact is already true', () => {
    const { result } = renderHook(() => useBootPhase(true));

    act(() => {
      vi.advanceTimersByTime(BOOT_FLOOR_MS - 50);
    });
    expect(result.current.phase).toBe('visible');
  });

  it('leaves once the floor has passed and the fact holds', () => {
    const { result } = renderHook(() => useBootPhase(true));

    act(() => {
      vi.advanceTimersByTime(BOOT_FLOOR_MS);
    });
    expect(result.current.phase).toBe('leaving');
    expect(result.current.mounted).toBe(true);

    act(() => {
      vi.advanceTimersByTime(BOOT_FADE_MS);
    });
    expect(result.current.phase).toBe('gone');
    expect(result.current.mounted).toBe(false);
  });

  it('stays up past the floor while the fact is still false', () => {
    const { result } = renderHook(() => useBootPhase(false));

    act(() => {
      vi.advanceTimersByTime(BOOT_FLOOR_MS + 100);
    });
    expect(result.current.phase).toBe('visible');
  });

  it('leaves as soon as a late fact arrives', () => {
    const { result, rerender } = renderHook(({ ready }) => useBootPhase(ready), {
      initialProps: { ready: false },
    });

    act(() => {
      vi.advanceTimersByTime(BOOT_FLOOR_MS + 100);
    });
    expect(result.current.phase).toBe('visible');

    rerender({ ready: true });
    expect(result.current.phase).toBe('leaving');
  });

  /** The bound that makes a permanent block impossible. */
  it('leaves at the ceiling even if the fact never arrives', () => {
    const { result } = renderHook(() => useBootPhase(false));

    act(() => {
      vi.advanceTimersByTime(BOOT_CEILING_MS);
    });
    expect(result.current.phase).toBe('leaving');

    act(() => {
      vi.advanceTimersByTime(BOOT_FADE_MS);
    });
    expect(result.current.mounted).toBe(false);
  });

  it('never comes back once it is gone', () => {
    const { result, rerender } = renderHook(({ ready }) => useBootPhase(ready), {
      initialProps: { ready: true },
    });

    // Two advances, not one: the fade timer is only armed once React has
    // committed the move to `leaving`, which happens at the end of the first act.
    act(() => {
      vi.advanceTimersByTime(BOOT_FLOOR_MS);
    });
    act(() => {
      vi.advanceTimersByTime(BOOT_FADE_MS);
    });
    expect(result.current.phase).toBe('gone');

    rerender({ ready: false });
    act(() => {
      vi.advanceTimersByTime(BOOT_CEILING_MS);
    });
    expect(result.current.phase).toBe('gone');
  });

  describe('under prefers-reduced-motion', () => {
    it('removes the overlay immediately, with no fade phase', () => {
      stubReducedMotion(true);
      const { result } = renderHook(() => useBootPhase(true));

      // No floor and no fade: the only frame that exists is the removal.
      expect(result.current.phase).toBe('gone');
      expect(result.current.animated).toBe(false);
    });

    it('still waits for the fact rather than skipping it', () => {
      stubReducedMotion(true);
      const { result, rerender } = renderHook(({ ready }) => useBootPhase(ready), {
        initialProps: { ready: false },
      });

      expect(result.current.phase).toBe('visible');
      rerender({ ready: true });
      expect(result.current.phase).toBe('gone');
    });
  });

  it('reports motion as allowed when the browser cannot answer', () => {
    // No matchMedia at all, which is jsdom and some older browsers.
    const { result } = renderHook(() => useBootPhase(false));
    expect(result.current.animated).toBe(true);
  });
});
