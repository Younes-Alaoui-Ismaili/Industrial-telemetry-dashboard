/**
 * Live fleet data, read from a real telemetry MCP server through the local
 * bridge.
 *
 * The return shape is the simulated hook's shape plus one field, `connection`,
 * so every presentational component takes either source without a change. That
 * extra field exists because the honest answer to "is this live" has to be
 * renderable: the caller reads it to decide whether to show live data or to fall
 * back, labelled, to the simulator.
 *
 * There is no silent fallback in this file. When the bridge or the server is not
 * there, the hook reports `unavailable` with the reason it got and holds no
 * data at all. Substituting readings here would make the whole feature a lie.
 *
 * For the same reason the simulator's seeded history has no counterpart here.
 * `useSimulatedData` opens with a full trend because inventing a plausible past
 * for an invented machine costs nothing; doing it for a real one would put
 * fabricated points on a plot labelled live. This history starts empty and stays
 * empty until the server sends measurements.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Alarm, Asset, AuditLog, History, MetricKey } from '../types';
import type { McpConnection, WireSnapshot } from '../types/mcp';
import { BRIDGE_URL, MCP_POLL_MS, MCP_STEP_MS, MCP_WINDOW_MS } from '../constants/mcp';
import { acknowledge as acknowledgeAlarm } from '../lib/alarms';
import { deviceIdFor, faultTypeFor, toAlarms, toAssets, toHistory } from '../lib/mcpMapping';

const IDLE: McpConnection = { status: 'idle', checkedAt: 0 };

function reasonOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    if (typeof body.detail === 'string' && body.detail !== '') return body.detail;
  } catch {
    // Fall through to the status line, which is still a usable reason.
  }
  return `Bridge answered ${response.status}.`;
}

export function useMcpData({ enabled }: { enabled: boolean }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [history, setHistory] = useState<History>({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [lastUpdate, setLastUpdate] = useState(0);
  const [connection, setConnection] = useState<McpConnection>(IDLE);

  // Lets a command force the next poll instead of waiting out the interval, so
  // an injected fault shows up as soon as the server has it.
  const [refreshKey, setRefreshKey] = useState(0);

  const alarmsRef = useRef<Alarm[]>([]);
  alarmsRef.current = alarms;

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

  /**
   * Acknowledgement is local. The telemetry server exposes detection, not an
   * alarm lifecycle, so there is nothing to acknowledge on its side and nothing
   * is pretended to be sent there.
   */
  const acknowledge = useCallback(
    (alarmId: string) => {
      setAlarms((prev) => acknowledgeAlarm(prev, alarmId, Date.now()));
      addAuditLog('acknowledge', 'alarm', alarmId, { acknowledged: true, scope: 'local' });
    },
    [addAuditLog],
  );

  const injectFault = useCallback(
    (assetId: string, metric?: MetricKey) => {
      const deviceId = deviceIdFor(assetId);
      const faultType = faultTypeFor(metric);
      addAuditLog('inject', 'fault', assetId, { deviceId, faultType, via: 'simulate_fault' });

      void fetch(`${BRIDGE_URL}/api/fault`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, fault_type: faultType }),
      })
        .then(async (response) => {
          if (!response.ok) {
            const detail = await readError(response);
            setConnection({ status: 'unavailable', detail, checkedAt: Date.now() });
            return;
          }
          setRefreshKey((key) => key + 1);
        })
        .catch((error: unknown) => {
          setConnection({ status: 'unavailable', detail: reasonOf(error), checkedAt: Date.now() });
        });
    },
    [addAuditLog],
  );

  /** The server owns the lifetime of a fault it accepted. Nothing to clear here. */
  const clearFaults = useCallback(() => {}, []);

  useEffect(() => {
    if (!enabled) {
      setConnection(IDLE);
      setAssets([]);
      setAlarms([]);
      setHistory({});
      setLastUpdate(0);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setConnection((prev) => ({ ...prev, status: 'connecting' }));

    const poll = async () => {
      const url = `${BRIDGE_URL}/api/snapshot?window_ms=${MCP_WINDOW_MS}&step_ms=${MCP_STEP_MS}`;
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (cancelled) return;

        if (!response.ok) {
          const detail = await readError(response);
          if (cancelled) return;
          setConnection({ status: 'unavailable', detail, checkedAt: Date.now() });
          setAssets([]);
          setHistory({});
          return;
        }

        const snapshot = (await response.json()) as WireSnapshot;
        if (cancelled) return;

        setAssets(toAssets(snapshot.devices ?? []));
        setHistory(toHistory(snapshot.telemetry ?? {}));
        setAlarms(toAlarms(snapshot.anomalies ?? [], alarmsRef.current, snapshot.fetchedAt));
        setLastUpdate(snapshot.fetchedAt);
        setConnection({
          status: 'live',
          server: snapshot.server,
          checkedAt: Date.now(),
        });
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setConnection({ status: 'unavailable', detail: reasonOf(error), checkedAt: Date.now() });
        setAssets([]);
        setHistory({});
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), MCP_POLL_MS);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [enabled, refreshKey]);

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
    connection,
  };
}

export type McpFleetData = ReturnType<typeof useMcpData>;
