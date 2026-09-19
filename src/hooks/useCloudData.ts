import { useCallback, useEffect, useRef, useState } from 'react';
import type { Alarm, Asset, History } from '../types';
import type { McpConnection, WireDevice, WireReading } from '../types/mcp';
import { assetIdFor, toAssets, toHistory } from '../lib/mcpMapping';

interface ApiDevice extends WireDevice { temperature_limit: number; vibration_limit: number }
interface ApiAlarm { id: string; device_id: string; metric: 'temperature' | 'vibration'; threshold: number; raised_at: number; peak_value: number; cleared_at: number | null; acknowledged_at: number | null }
export interface OperationalReport { alarm_count: number; acknowledged_count?: number; average_acknowledgement_ms?: number | null; average_cleared_duration_ms?: number | null }
interface Snapshot { assets: Asset[]; alarms: Alarm[]; history: History; lastUpdate: number; deployment: string; isOperator: boolean; report: OperationalReport | null }
const empty = (): Snapshot => ({ assets: [], alarms: [], history: {}, lastUpdate: 0, deployment: 'unknown', isOperator: false, report: null });

export function useCloudData({ enabled, token }: { enabled: boolean; token: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(empty);
  const [connection, setConnection] = useState<McpConnection>({ status: 'idle', checkedAt: 0 });
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const request = useCallback(async <T,>(path: string, method = 'GET'): Promise<T> => {
    const response = await fetch('/api/v1' + path, { method, credentials: 'same-origin',
      headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(response.status === 401 ? 'Sign in or enter a local access token.' : response.status === 403 ? 'This account cannot perform this action.' : 'API unavailable (' + response.status + ').');
    return response.json() as Promise<T>;
  }, [token]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const health = await request<{ deployment: string; role: string }>('/health');
        const [{ devices }, { alarms }, report] = await Promise.all([
          request<{ devices: ApiDevice[] }>('/devices'), request<{ alarms: ApiAlarm[] }>('/alarms'),
          request<OperationalReport>('/report'),
        ]);
        const readings = await Promise.all(devices.map(async device => [device.id, (await request<{ readings: WireReading[] }>('/telemetry?device_id=' + encodeURIComponent(device.id))).readings] as const));
        if (cancelled) return;
        const assets = toAssets(devices).map((asset, index) => ({ ...asset, spec: { ...asset.spec, metrics: asset.spec.metrics.map(metric => ({
          ...metric, warn: undefined, alarm: metric.key === 'temperature' ? devices[index].temperature_limit : metric.key === 'vibration' ? devices[index].vibration_limit : metric.alarm,
        })) } }));
        setSnapshot({ assets, history: toHistory(Object.fromEntries(readings)), lastUpdate: Date.now(), deployment: health.deployment, isOperator: health.role === 'Operator', report,
          alarms: alarms.map(alarm => ({ id: alarm.id, assetId: assetIdFor(alarm.device_id), metric: alarm.metric, severity: 'alarm', threshold: alarm.threshold,
            unit: alarm.metric === 'temperature' ? '°C' : 'mm/s', decimals: 1, raisedAt: alarm.raised_at, peakValue: alarm.peak_value,
            ...(alarm.cleared_at === null ? {} : { clearedAt: alarm.cleared_at }),
            ...(alarm.acknowledged_at === null ? {} : { acknowledgedAt: alarm.acknowledged_at }) })) });
        setConnection({ status: 'live', checkedAt: Date.now() });
      } catch (error) {
        if (!cancelled) { setSnapshot(empty()); setConnection({ status: 'unavailable', checkedAt: Date.now(), detail: error instanceof Error ? error.message : 'API unavailable' }); }
      } finally { busy = false; }
    };
    refreshRef.current = refresh;
    setConnection({ status: 'connecting', checkedAt: Date.now() });
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 3000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [enabled, request]);

  const acknowledge = useCallback(async (id: string) => {
    if (!snapshot.isOperator) return;
    try {
      await request('/alarms/' + encodeURIComponent(id) + '/acknowledgements', 'POST');
      await refreshRef.current();
    } catch (error) { setConnection({ status: 'unavailable', checkedAt: Date.now(), detail: error instanceof Error ? error.message : 'Acknowledgement failed' }); }
  }, [request, snapshot.isOperator]);
  return { ...snapshot, connection, acknowledge, injectFault: undefined };
}
