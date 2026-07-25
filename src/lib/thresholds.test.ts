import { describe, it, expect } from 'vitest';
import { evaluate, hasLimits, limitFor, worstLevel } from './thresholds';
import type { MetricSpec } from '../types';

const temp: MetricSpec = {
  key: 'temperature',
  label: 'Temp',
  unit: 'C',
  decimals: 1,
  nominal: 62,
  jitter: 0.8,
  warn: 72,
  alarm: 77,
};

const counter: MetricSpec = {
  key: 'cycles',
  label: 'Cycles',
  unit: '',
  decimals: 0,
  nominal: 100,
  jitter: 2,
  counter: true,
};

describe('evaluate', () => {
  it('reports normal inside the limits', () => {
    expect(evaluate(62, temp)).toBe('normal');
    expect(evaluate(71.9, temp)).toBe('normal');
  });

  it('treats a value exactly on a limit as still inside it', () => {
    expect(evaluate(72, temp)).toBe('normal');
    expect(evaluate(77, temp)).toBe('warning');
  });

  it('reports warning above the warning limit', () => {
    expect(evaluate(72.1, temp)).toBe('warning');
    expect(evaluate(76.9, temp)).toBe('warning');
  });

  it('reports alarm above the alarm limit', () => {
    expect(evaluate(77.1, temp)).toBe('alarm');
    expect(evaluate(120, temp)).toBe('alarm');
  });

  it('never alarms on a metric without limits', () => {
    expect(evaluate(999999, counter)).toBe('normal');
  });
});

describe('limitFor', () => {
  it('returns the limit matching the level', () => {
    expect(limitFor('alarm', temp)).toBe(77);
    expect(limitFor('warning', temp)).toBe(72);
    expect(limitFor('normal', temp)).toBeUndefined();
  });
});

describe('hasLimits', () => {
  it('distinguishes limited metrics from counters', () => {
    expect(hasLimits(temp)).toBe(true);
    expect(hasLimits(counter)).toBe(false);
  });
});

describe('worstLevel', () => {
  it('lets the worst metric win so a normal reading cannot mask an alarm', () => {
    expect(worstLevel(['normal', 'alarm', 'normal'])).toBe('alarm');
    expect(worstLevel(['normal', 'warning'])).toBe('warning');
    expect(worstLevel(['normal', 'normal'])).toBe('normal');
    expect(worstLevel([])).toBe('normal');
  });
});
