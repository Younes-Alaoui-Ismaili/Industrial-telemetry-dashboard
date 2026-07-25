import { describe, it, expect } from 'vitest';
import { formatClock, formatValue, formatWithUnit } from './format';
import type { MetricSpec } from '../types';

const spec = (decimals: number, unit: string): MetricSpec => ({
  key: 'temperature',
  label: 'Temp',
  unit,
  decimals,
  nominal: 0,
  jitter: 0,
});

describe('formatValue', () => {
  it('keeps the digit count stable so readouts do not jitter', () => {
    const s = spec(1, 'C');
    expect(formatValue(62, s)).toBe('62.0');
    expect(formatValue(62.049, s)).toBe('62.0');
    expect(formatValue(7, s)).toBe('7.0');
  });

  it('honours two decimals', () => {
    expect(formatValue(2.1, spec(2, 'mm/s'))).toBe('2.10');
  });

  it('rounds and groups integer metrics', () => {
    expect(formatValue(11999.6, spec(0, 'rpm'))).toBe('12,000');
    expect(formatValue(48210, spec(0, ''))).toBe('48,210');
  });
});

describe('formatWithUnit', () => {
  it('appends the unit when there is one', () => {
    expect(formatWithUnit(62, spec(1, 'C'))).toBe('62.0 C');
  });

  it('omits the separator for unitless counters', () => {
    expect(formatWithUnit(48210, spec(0, ''))).toBe('48,210');
  });
});

describe('formatClock', () => {
  it('renders a 24 hour clock without a date', () => {
    const t = new Date(2026, 6, 25, 14, 5, 9).getTime();
    expect(formatClock(t)).toBe('14:05:09');
  });
});
