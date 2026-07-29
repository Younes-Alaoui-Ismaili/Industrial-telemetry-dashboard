import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimulatedData } from './useSimulatedData';
import { FLEET, HISTORY_LENGTH, TICK_MS } from '../constants/fleet';
import { alarmState } from '../lib/alarms';
import { evaluate } from '../lib/thresholds';

describe('useSimulatedData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Equivalent of the original "seeds the simulated devices on mount".
  it('seeds the whole fleet on mount', () => {
    const { result } = renderHook(() => useSimulatedData());

    expect(result.current.assets).toHaveLength(FLEET.length);
    expect(result.current.assets.map((a) => a.spec.id).slice(0, 4)).toEqual([
      'PRESS-01',
      'SPINDLE-02',
      'CONVEYOR-03',
      'PUMP-04',
    ]);
    expect(result.current.assets.every((a) => a.state === 'running')).toBe(true);
  });

  it('seeds every asset with its nominal readings', () => {
    const { result } = renderHook(() => useSimulatedData());
    const press = result.current.assets[0];
    expect(press.values.temperature).toBe(press.spec.metrics[0].nominal);
  });

  /**
   * Replaces the original "generates metric history on each tick", which asserted
   * that history started empty and grew a point per tick. History now opens full,
   * so counting points no longer says anything: what the tick has to do is
   * continue the series it was handed, which is what these two assert instead.
   */
  it('opens with a full trend rather than an empty plot', () => {
    const { result } = renderHook(() => useSimulatedData());

    expect(Object.keys(result.current.history).length).toBeGreaterThan(0);
    expect(result.current.history['PRESS-01:temperature']).toHaveLength(HISTORY_LENGTH);
  });

  it('continues the seeded series on each tick instead of restarting it', () => {
    const { result } = renderHook(() => useSimulatedData());
    const seeded = result.current.history['PRESS-01:temperature'];
    const lastSeededAt = seeded[seeded.length - 1].timestamp;

    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });

    const advanced = result.current.history['PRESS-01:temperature'];
    expect(advanced).toHaveLength(HISTORY_LENGTH);
    expect(advanced[advanced.length - 1].timestamp).toBeGreaterThan(lastSeededAt);
  });

  it('stamps the seeded samples backwards at the tick interval', () => {
    const { result } = renderHook(() => useSimulatedData());
    const samples = result.current.history['PRESS-01:temperature'];

    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i].timestamp - samples[i - 1].timestamp).toBe(TICK_MS);
    }
    // The series ends now, not in the past, so the trend meets the live tick.
    expect(samples[samples.length - 1].timestamp).toBe(result.current.lastUpdate);
  });

  /**
   * The seam the translation inside `seedHistory` exists to remove. `cycles` is
   * the metric that would betray a missing translation: it only ever counts up,
   * so an untranslated series would end above nominal and the first tick would
   * step backwards in full view.
   */
  it('joins the seeded series onto the mounted reading of every metric', () => {
    const { result } = renderHook(() => useSimulatedData());

    for (const asset of result.current.assets) {
      for (const spec of asset.spec.metrics) {
        const samples = result.current.history[`${asset.spec.id}:${spec.key}`];
        expect(samples[samples.length - 1].value).toBeCloseTo(asset.values[spec.key]!, 9);
      }
    }
  });

  // The healthy fleet guarantee has to hold over the invented past too, otherwise
  // the demo opens on an alarm nobody caused.
  it('keeps every seeded sample inside its operating limits', () => {
    const { result } = renderHook(() => useSimulatedData());

    for (const asset of result.current.assets) {
      for (const spec of asset.spec.metrics) {
        for (const sample of result.current.history[`${asset.spec.id}:${spec.key}`]) {
          expect(evaluate(sample.value, spec)).toBe('normal');
        }
      }
    }
  });

  it('advances the last update stamp as it ticks', () => {
    const { result } = renderHook(() => useSimulatedData());
    const before = result.current.lastUpdate;
    act(() => {
      vi.advanceTimersByTime(TICK_MS * 2);
    });
    expect(result.current.lastUpdate).toBeGreaterThanOrEqual(before);
  });

  // Replaces the original "seeds demo alerts on mount": alarms are no longer
  // fabricated, they are earned by a reading leaving its limits.
  it('starts with no alarms because a healthy fleet has none', () => {
    const { result } = renderHook(() => useSimulatedData());
    expect(result.current.alarms).toHaveLength(0);
  });

  it('keeps a healthy fleet alarm free across many ticks', () => {
    const { result } = renderHook(() => useSimulatedData());
    act(() => {
      vi.advanceTimersByTime(TICK_MS * 40);
    });
    expect(result.current.alarms).toHaveLength(0);
  });

  it('raises a real alarm when a fault is injected', () => {
    const { result } = renderHook(() => useSimulatedData());

    act(() => {
      result.current.injectFault('PRESS-01');
    });
    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });

    expect(result.current.alarms).toHaveLength(1);
    expect(result.current.alarms[0]).toMatchObject({
      assetId: 'PRESS-01',
      metric: 'temperature',
      severity: 'alarm',
    });
    expect(result.current.assets[0].state).toBe('fault');
  });

  it('clears the alarm once the injected fault expires', () => {
    const { result } = renderHook(() => useSimulatedData());

    act(() => {
      result.current.injectFault('PRESS-01');
    });
    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });
    expect(alarmState(result.current.alarms[0])).toBe('unacknowledged');

    act(() => {
      vi.advanceTimersByTime(TICK_MS * 30);
    });

    expect(alarmState(result.current.alarms[0])).toBe('returned-unacknowledged');
    expect(result.current.assets[0].state).toBe('running');
  });

  it('ignores a fault aimed at an unknown asset', () => {
    const { result } = renderHook(() => useSimulatedData());
    act(() => {
      result.current.injectFault('NOPE-99');
    });
    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });
    expect(result.current.alarms).toHaveLength(0);
  });

  // Equivalent of the original "acknowledges a seeded alert and records an audit
  // entry", now asserting the transition rather than a removal.
  it('acknowledges an alarm as a state transition and records an audit entry', () => {
    const { result } = renderHook(() => useSimulatedData());

    act(() => {
      result.current.injectFault('SPINDLE-02');
    });
    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });

    const target = result.current.alarms[0];
    expect(alarmState(target)).toBe('unacknowledged');

    act(() => {
      result.current.acknowledge(target.id);
    });

    // The alarm is still there. Acknowledging is not deleting.
    expect(result.current.alarms).toHaveLength(1);
    expect(alarmState(result.current.alarms[0])).toBe('acknowledged');

    const entry = result.current.auditLogs.find((l) => l.action === 'acknowledge');
    expect(entry).toMatchObject({ resource: 'alarm', resourceId: target.id });
    expect(entry?.timestamp).toBe(new Date(entry?.timestamp ?? '').toISOString());
  });

  it('records an audit entry when a fault is injected', () => {
    const { result } = renderHook(() => useSimulatedData());
    act(() => {
      result.current.injectFault('PUMP-04');
    });
    expect(result.current.auditLogs[0]).toMatchObject({
      action: 'inject',
      resource: 'fault',
      resourceId: 'PUMP-04',
    });
  });

  // Equivalent of the original "addAuditLog prepends a well-formed entry".
  it('addAuditLog prepends a well-formed entry', () => {
    const { result } = renderHook(() => useSimulatedData());

    act(() => {
      result.current.addAuditLog('create', 'asset', 'a-1', { foo: 'bar' });
    });
    act(() => {
      result.current.addAuditLog('delete', 'asset', 'a-2', {});
    });

    expect(result.current.auditLogs).toHaveLength(2);
    expect(result.current.auditLogs[0]).toMatchObject({
      action: 'delete',
      resource: 'asset',
      resourceId: 'a-2',
      userId: 'local-user',
    });
  });

  it('caps history so memory does not grow without bound', () => {
    const { result } = renderHook(() => useSimulatedData());
    act(() => {
      vi.advanceTimersByTime(TICK_MS * 80);
    });
    expect(result.current.history['PRESS-01:temperature'].length).toBeLessThanOrEqual(60);
  });
});
