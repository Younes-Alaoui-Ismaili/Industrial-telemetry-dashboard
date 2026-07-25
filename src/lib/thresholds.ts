/**
 * Comparing readings against operating limits.
 *
 * Limits are exclusive: a reading exactly at the limit is still inside it. This
 * matches how a plant states a limit ("must not exceed") and keeps a value
 * resting exactly on the limit from flapping.
 */

import type { MetricLevel, MetricSpec } from '../types';

export function evaluate(value: number, spec: MetricSpec): MetricLevel {
  if (spec.alarm !== undefined && value > spec.alarm) return 'alarm';
  if (spec.warn !== undefined && value > spec.warn) return 'warning';
  return 'normal';
}

/** The limit a level corresponds to, or undefined when the reading is normal. */
export function limitFor(level: MetricLevel, spec: MetricSpec): number | undefined {
  if (level === 'alarm') return spec.alarm;
  if (level === 'warning') return spec.warn;
  return undefined;
}

/** True when the metric has any limit at all. Counters do not. */
export function hasLimits(spec: MetricSpec): boolean {
  return spec.warn !== undefined || spec.alarm !== undefined;
}

/**
 * Worst level across an asset's metrics, used to colour a tile without letting a
 * single normal metric mask an alarming one.
 */
export function worstLevel(levels: readonly MetricLevel[]): MetricLevel {
  if (levels.includes('alarm')) return 'alarm';
  if (levels.includes('warning')) return 'warning';
  return 'normal';
}
