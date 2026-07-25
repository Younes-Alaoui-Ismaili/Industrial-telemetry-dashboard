/**
 * Alarm lifecycle.
 *
 * An alarm is an object with a life, not a message in a list. It is raised when a
 * reading leaves its limits, it tracks its own peak, it is cleared when the
 * reading returns, and it is acknowledged by an operator. Those last two are
 * independent, which is why a reading that recovers before anyone acknowledged it
 * lands in its own state rather than silently disappearing.
 *
 * Nothing here reads the clock: `now` is always passed in, so tests are exact.
 */

import type { Alarm, AlarmState, Asset, MetricLevel, MetricSpec, Severity } from '../types';
import { evaluate, limitFor } from './thresholds';

export function alarmState(alarm: Alarm): AlarmState {
  if (alarm.clearedAt === undefined) {
    return alarm.acknowledgedAt === undefined ? 'unacknowledged' : 'acknowledged';
  }
  return alarm.acknowledgedAt === undefined ? 'returned-unacknowledged' : 'cleared';
}

/** An alarm leaves the operator's list only once it is both cleared and acknowledged. */
export function isOpen(alarm: Alarm): boolean {
  return alarmState(alarm) !== 'cleared';
}

export function alarmDuration(alarm: Alarm, now: number): number {
  return Math.max(0, (alarm.clearedAt ?? now) - alarm.raisedAt);
}

export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

function severityOf(level: MetricLevel): Severity | undefined {
  if (level === 'alarm') return 'alarm';
  if (level === 'warning') return 'warning';
  return undefined;
}

/** Stable identity of the currently open alarm for one asset and metric. */
function keyOf(assetId: string, metric: string): string {
  return `${assetId}:${metric}`;
}

/**
 * Advance the alarm list against the current readings.
 *
 * Raises at most one open alarm per asset and metric. While an alarm stays open
 * it absorbs the reading rather than spawning duplicates, tracking the peak and
 * escalating from warning to alarm if the reading gets worse. When the reading
 * returns inside its limits the alarm is stamped cleared, keeping its history.
 */
export function reconcileAlarms(
  existing: readonly Alarm[],
  assets: readonly Asset[],
  now: number,
): Alarm[] {
  const next = existing.map((a) => ({ ...a }));
  const openByKey = new Map<string, Alarm>();
  for (const alarm of next) {
    if (alarm.clearedAt === undefined) openByKey.set(keyOf(alarm.assetId, alarm.metric), alarm);
  }

  for (const asset of assets) {
    for (const spec of asset.spec.metrics) {
      const value = asset.values[spec.key];
      if (value === undefined) continue;

      const level = evaluate(value, spec);
      const severity = severityOf(level);
      const key = keyOf(asset.spec.id, spec.key);
      const open = openByKey.get(key);

      if (severity === undefined) {
        if (open) {
          open.clearedAt = now;
          openByKey.delete(key);
        }
        continue;
      }

      if (open) {
        open.peakValue = Math.max(open.peakValue, value);
        if (severity === 'alarm' && open.severity === 'warning') {
          open.severity = 'alarm';
          open.threshold = spec.alarm ?? open.threshold;
        }
        continue;
      }

      next.push(raise(asset.spec.id, spec, level, value, now));
    }
  }

  return next;
}

function raise(
  assetId: string,
  spec: MetricSpec,
  level: MetricLevel,
  value: number,
  now: number,
): Alarm {
  const severity = severityOf(level) as Severity;
  return {
    id: `${assetId}:${spec.key}:${now}`,
    assetId,
    metric: spec.key,
    severity,
    threshold: limitFor(level, spec) ?? 0,
    unit: spec.unit,
    decimals: spec.decimals,
    raisedAt: now,
    peakValue: value,
  };
}

/** Acknowledge one alarm. Returns a new list; never removes anything. */
export function acknowledge(alarms: readonly Alarm[], alarmId: string, now: number): Alarm[] {
  return alarms.map((alarm) =>
    alarm.id === alarmId && alarm.acknowledgedAt === undefined
      ? { ...alarm, acknowledgedAt: now }
      : alarm,
  );
}

export function countBySeverity(alarms: readonly Alarm[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { warning: 0, alarm: 0 };
  for (const alarm of alarms) {
    if (alarm.clearedAt === undefined) counts[alarm.severity] += 1;
  }
  return counts;
}
