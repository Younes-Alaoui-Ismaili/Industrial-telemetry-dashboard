import { describe, it, expect } from 'vitest';
import { CRITICAL_TREND_COUNT, HYSTERESIS, pickCriticalTrends } from './trendPriority';
import type { Asset, AssetSpec, MetricSpec } from '../types';

const temperature: MetricSpec = {
  key: 'temperature',
  label: 'Temp',
  unit: 'C',
  decimals: 1,
  nominal: 55,
  jitter: 0.8,
  warn: 65,
  alarm: 70,
};

const vibration: MetricSpec = {
  key: 'vibration',
  label: 'Vibration',
  unit: 'mm/s',
  decimals: 2,
  nominal: 1.7,
  jitter: 0.12,
  warn: 3.0,
  alarm: 3.7,
};

const cycles: MetricSpec = {
  key: 'cycles',
  label: 'Cycles',
  unit: '',
  decimals: 0,
  nominal: 48210,
  jitter: 0,
  counter: true,
};

/** The MCP shape for a device whose limits the server does not publish. */
const unknownPressure: MetricSpec = {
  key: 'pressure',
  label: 'Pressure',
  unit: '',
  decimals: 2,
  nominal: 0,
  jitter: 0,
};

const assetWith = (
  id: string,
  metrics: MetricSpec[],
  values: Partial<Record<string, number>>,
): Asset => {
  const spec: AssetSpec = { id, name: 'Test Machine', kind: 'pump', metrics };
  return { spec, state: 'running', values, lastSeen: 0 };
};

describe('pickCriticalTrends', () => {
  it('puts the worst level first, whatever the proximity says', () => {
    // Vibration is alarming; temperature sits closer to its own limit in
    // fractional terms but is only warning.
    const fleet = [
      assetWith('PUMP-04', [temperature], { temperature: 69.5 }),
      assetWith('SPINDLE-02', [vibration], { vibration: 3.9 }),
    ];

    const picks = pickCriticalTrends(fleet, 2);
    expect(picks.map((p) => p.assetId)).toEqual(['SPINDLE-02', 'PUMP-04']);
  });

  it('orders same level candidates by how far they have travelled towards the limit', () => {
    const fleet = [
      assetWith('A-01', [temperature], { temperature: 58 }),
      assetWith('B-02', [temperature], { temperature: 64 }),
      assetWith('C-03', [temperature], { temperature: 56 }),
    ];

    expect(pickCriticalTrends(fleet, 3).map((p) => p.assetId)).toEqual(['B-02', 'A-01', 'C-03']);
  });

  it('breaks ties deterministically and repeatably', () => {
    const fleet = [
      assetWith('B-02', [temperature], { temperature: 55 }),
      assetWith('A-01', [temperature], { temperature: 55 }),
    ];

    const first = pickCriticalTrends(fleet, 2);
    const second = pickCriticalTrends(fleet, 2);
    expect(first.map((p) => p.assetId)).toEqual(['A-01', 'B-02']);
    expect(second).toEqual(first);
  });

  it('sorts a tie inside one asset by metric key', () => {
    const fleet = [assetWith('A-01', [vibration, temperature], { temperature: 55, vibration: 1.7 })];

    expect(pickCriticalTrends(fleet, 2).map((p) => p.spec.key)).toEqual([
      'temperature',
      'vibration',
    ]);
  });

  it('never picks a counter or any metric without limits', () => {
    const fleet = [
      assetWith('PRESS-01', [cycles, unknownPressure, temperature], {
        cycles: 999999,
        pressure: 12,
        temperature: 55,
      }),
    ];

    const picks = pickCriticalTrends(fleet, 2);
    expect(picks).toHaveLength(1);
    expect(picks[0].spec.key).toBe('temperature');
  });

  it('skips metrics that have no reading yet', () => {
    const fleet = [assetWith('A-01', [temperature, vibration], { temperature: 60 })];

    expect(pickCriticalTrends(fleet, 2).map((p) => p.spec.key)).toEqual(['temperature']);
  });

  it('returns what exists rather than padding to the requested count', () => {
    expect(pickCriticalTrends([], CRITICAL_TREND_COUNT)).toEqual([]);
    expect(pickCriticalTrends([assetWith('A-01', [temperature], { temperature: 55 })], 5)).toHaveLength(
      1,
    );
  });

  it('keeps an incumbent in place against a marginally closer challenger', () => {
    const incumbent = { assetId: 'A-01', spec: temperature };
    // The challenger leads by 0.05 of the span, less than the incumbent bonus.
    const fleet = [
      assetWith('A-01', [temperature], { temperature: 56 }),
      assetWith('B-02', [temperature], { temperature: 56.75 }),
    ];

    expect(pickCriticalTrends(fleet, 1, [incumbent])[0].assetId).toBe('A-01');
  });

  it('hands the slot over once the challenger clears the hysteresis margin', () => {
    const incumbent = { assetId: 'A-01', spec: temperature };
    // Two spans worth of bonus ahead, so the swap is a real move, not noise.
    const fleet = [
      assetWith('A-01', [temperature], { temperature: 56 }),
      assetWith('B-02', [temperature], { temperature: 56 + 15 * (HYSTERESIS * 2) + 1 }),
    ];

    expect(pickCriticalTrends(fleet, 1, [incumbent])[0].assetId).toBe('B-02');
  });

  it('lets an escalation preempt an incumbent immediately', () => {
    const incumbent = { assetId: 'A-01', spec: temperature };
    const fleet = [
      assetWith('A-01', [temperature], { temperature: 64.9 }),
      assetWith('B-02', [temperature], { temperature: 65.1 }),
    ];

    expect(pickCriticalTrends(fleet, 1, [incumbent])[0].assetId).toBe('B-02');
  });

  it('scores a degenerate spec at zero rather than letting it hijack the zone', () => {
    // Nominal above the limits is a data error, not a critical machine. Scored
    // naively it would read as 1.5 spans travelled and outrank a real excursion.
    const impossible: MetricSpec = { ...temperature, nominal: 90, warn: 65, alarm: 70 };
    const fleet = [
      assetWith('A-01', [impossible], { temperature: 60 }),
      assetWith('B-02', [temperature], { temperature: 60 }),
    ];

    const picks = pickCriticalTrends(fleet, 2);
    expect(picks.map((p) => p.assetId)).toEqual(['B-02', 'A-01']);
  });
});
