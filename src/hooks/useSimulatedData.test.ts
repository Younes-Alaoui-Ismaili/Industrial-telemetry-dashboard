import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSimulatedData } from './useSimulatedData';
import { FLEET, TICK_MS } from '../constants/fleet';
import { alarmState } from '../lib/alarms';

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

  // Equivalent of the original "generates metric history on each tick".
  it('records metric history on each tick', () => {
    const { result } = renderHook(() => useSimulatedData());
    expect(Object.keys(result.current.history)).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });

    expect(result.current.history['PRESS-01:temperature']).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(TICK_MS);
    });

    expect(result.current.history['PRESS-01:temperature']).toHaveLength(2);
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
