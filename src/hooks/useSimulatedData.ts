/**
 * Simulated fleet data source.
 *
 * Owns the live values, the rolling history and the alarm list, and advances them
 * on a fixed tick. Readings are a bounded random walk around each metric's nominal
 * value, tight enough that a healthy machine never trips a limit on noise alone,
 * so any alarm on screen is one somebody caused.
 *
 * `injectFault` is what makes the dashboard demonstrable: it drives one metric
 * past its alarm limit for a bounded window, which raises a real alarm through the
 * same code path as any other threshold crossing. Nothing about the alarm is faked.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Alarm, Asset, AuditLog, History, MetricKey, MetricSpec } from '../types';
import { FAULT_DURATION_MS, FLEET, HISTORY_LENGTH, TICK_MS } from '../constants/fleet';
import { acknowledge as acknowledgeAlarm, reconcileAlarms } from '../lib/alarms';
import { hasLimits } from '../lib/thresholds';

interface ActiveFault {
  assetId: string;
  metric: MetricKey;
  until: number;
}

function seedAssets(now: number): Asset[] {
  return FLEET.map((spec) => {
    const values: Partial<Record<MetricKey, number>> = {};
    for (const metric of spec.metrics) values[metric.key] = metric.nominal;
    return { spec, state: 'running', values, lastSeen: now };
  });
}

/** Bounded random walk that pulls back toward nominal so values never drift away. */
function walk(current: number, spec: MetricSpec): number {
  if (spec.counter) return current + Math.max(1, Math.round(spec.jitter * Math.random()));
  const pull = (spec.nominal - current) * 0.25;
  const noise = (Math.random() * 2 - 1) * spec.jitter;
  return current + pull + noise;
}

/** Value that sits clearly past the alarm limit, used while a fault is active. */
function faultValue(spec: MetricSpec): number {
  const limit = spec.alarm ?? spec.warn;
  if (limit === undefined) return spec.nominal;
  const overshoot = Math.max(Math.abs(limit) * 0.08, spec.jitter * 4);
  return limit + overshoot + Math.random() * spec.jitter;
}

/** First metric on an asset that actually has a limit to cross. */
function faultableMetric(assetId: string): MetricSpec | undefined {
  const spec = FLEET.find((a) => a.id === assetId);
  return spec?.metrics.find(hasLimits);
}

export function useSimulatedData() {
  const [assets, setAssets] = useState<Asset[]>(() => seedAssets(Date.now()));
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [history, setHistory] = useState<History>({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [lastUpdate, setLastUpdate] = useState<number>(() => Date.now());

  // Faults live in a ref so changing them never restarts the interval.
  const faultsRef = useRef<ActiveFault[]>([]);

  const addAuditLog = useCallback(
    (action: string, resource: string, resourceId: string, details: Record<string, unknown>) => {
      setAuditLogs((prev) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          userId: 'local-user',
          action,
          resource,
          resourceId,
          timestamp: new Date().toISOString(),
          details,
        },
        ...prev,
      ]);
    },
    [],
  );

  const acknowledge = useCallback(
    (alarmId: string) => {
      setAlarms((prev) => acknowledgeAlarm(prev, alarmId, Date.now()));
      addAuditLog('acknowledge', 'alarm', alarmId, { acknowledged: true });
    },
    [addAuditLog],
  );

  const injectFault = useCallback(
    (assetId: string, metric?: MetricKey) => {
      const spec = metric
        ? FLEET.find((a) => a.id === assetId)?.metrics.find((m) => m.key === metric && hasLimits(m))
        : faultableMetric(assetId);
      if (!spec) return;

      faultsRef.current = [
        ...faultsRef.current.filter((f) => !(f.assetId === assetId && f.metric === spec.key)),
        { assetId, metric: spec.key, until: Date.now() + FAULT_DURATION_MS },
      ];
      addAuditLog('inject', 'fault', assetId, { metric: spec.key });
    },
    [addAuditLog],
  );

  const clearFaults = useCallback(() => {
    faultsRef.current = [];
  }, []);

  // A single interval drives the whole simulation. Every update is functional, so
  // the effect never depends on the state it writes and the timer is never reset.
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      faultsRef.current = faultsRef.current.filter((f) => f.until > now);
      const faults = faultsRef.current;

      let advanced: Asset[] = [];
      setAssets((prev) => {
        advanced = prev.map((asset) => {
          const values: Partial<Record<MetricKey, number>> = {};
          let faulted = false;

          for (const spec of asset.spec.metrics) {
            const active = faults.some((f) => f.assetId === asset.spec.id && f.metric === spec.key);
            const current = asset.values[spec.key] ?? spec.nominal;
            values[spec.key] = active ? faultValue(spec) : walk(current, spec);
            if (active) faulted = true;
          }

          return { ...asset, state: faulted ? 'fault' : 'running', values, lastSeen: now };
        });
        return advanced;
      });

      setHistory((prev) => {
        const next: History = { ...prev };
        for (const asset of advanced) {
          for (const spec of asset.spec.metrics) {
            const value = asset.values[spec.key];
            if (value === undefined) continue;
            const key = `${asset.spec.id}:${spec.key}`;
            next[key] = [...(next[key] ?? []), { timestamp: now, value }].slice(-HISTORY_LENGTH);
          }
        }
        return next;
      });

      setAlarms((prev) => reconcileAlarms(prev, advanced, now));
      setLastUpdate(now);
    };

    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  return {
    assets,
    alarms,
    history,
    auditLogs,
    lastUpdate,
    acknowledge,
    injectFault,
    clearFaults,
    addAuditLog,
  };
}

export type FleetData = ReturnType<typeof useSimulatedData>;
