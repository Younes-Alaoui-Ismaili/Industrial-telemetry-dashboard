import { describe, it, expect } from 'vitest';
import { FLEET } from './fleet';
import { evaluate, hasLimits } from '../lib/thresholds';

describe('fleet definition', () => {
  it('has a fleet large enough to look like a plant', () => {
    expect(FLEET.length).toBeGreaterThanOrEqual(8);
  });

  it('uses plant style tags rather than generic device names', () => {
    for (const asset of FLEET) {
      expect(asset.id).toMatch(/^[A-Z]+-\d{2}$/);
      expect(asset.id).not.toMatch(/device/i);
    }
  });

  it('has unique identifiers', () => {
    expect(new Set(FLEET.map((a) => a.id)).size).toBe(FLEET.length);
  });

  /**
   * The first four machines are the ones the companion telemetry server also
   * exposes. Keeping the mapping asserted stops the two projects drifting into
   * describing different plants.
   */
  it('maps its first four assets onto the companion server fleet', () => {
    expect(FLEET.slice(0, 4).map((a) => [a.id, a.sourceId, a.name])).toEqual([
      ['PRESS-01', 'press-01', 'Hydraulic Press'],
      ['SPINDLE-02', 'spindle-02', 'CNC Spindle'],
      ['CONVEYOR-03', 'conveyor-03', 'Conveyor Motor'],
      ['PUMP-04', 'pump-04', 'Coolant Pump'],
    ]);
  });

  it('gives every asset at least one metric with limits to alarm on', () => {
    for (const asset of FLEET) {
      expect(asset.metrics.some(hasLimits)).toBe(true);
    }
  });

  it('varies metrics across machine kinds instead of repeating one uniform row', () => {
    const shapes = new Set(FLEET.map((a) => a.metrics.map((m) => m.key).join(',')));
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('orders limits so warning always comes before alarm', () => {
    for (const asset of FLEET) {
      for (const metric of asset.metrics) {
        if (metric.warn !== undefined && metric.alarm !== undefined) {
          expect(metric.warn).toBeLessThan(metric.alarm);
        }
      }
    }
  });

  /**
   * The important invariant of the simulation: ordinary noise must never trip a
   * limit, otherwise the dashboard cries wolf and every alarm becomes meaningless.
   */
  it('keeps nominal plus worst case noise clear of the warning limit', () => {
    for (const asset of FLEET) {
      for (const metric of asset.metrics) {
        if (metric.warn === undefined || metric.counter) continue;
        expect(evaluate(metric.nominal + metric.jitter, metric)).toBe('normal');
      }
    }
  });

  it('always carries a unit for metrics that are not bare counters', () => {
    for (const asset of FLEET) {
      for (const metric of asset.metrics) {
        if (!metric.counter) expect(metric.unit).not.toBe('');
      }
    }
  });
});
