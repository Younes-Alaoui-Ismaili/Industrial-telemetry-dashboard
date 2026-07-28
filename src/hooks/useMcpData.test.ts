/**
 * The live hook, driven against a stubbed bridge. `fetch` is replaced, so no
 * socket is opened and no server is started.
 *
 * The assertions that matter most are the negative ones: when the bridge answers
 * 503 or does not answer at all, the hook must end up holding nothing and saying
 * why. A hook that quietly kept its last good readings would be the failure this
 * whole feature exists to prevent.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMcpData } from './useMcpData';
import { BRIDGE_URL } from '../constants/mcp';

const NOW = 1_700_000_000_000;

const SNAPSHOT = {
  status: 'live',
  server: { name: 'telemetry', version: '0.1.0' },
  fetchedAt: NOW,
  window: { start: NOW - 900_000, end: NOW, step_ms: 30_000 },
  devices: [
    {
      id: 'press-01',
      name: 'Hydraulic Press',
      state: 'running',
      temperature_c: 62.4,
      vibration_mm_s: 2.05,
      timestamp: NOW,
    },
  ],
  anomalies: [
    {
      id: 'anom-1',
      device_id: 'press-01',
      metric: 'temperature',
      started_at: NOW - 60_000,
      ended_at: NOW + 60_000,
      peak_value: 90.2,
      threshold: 77,
      sample_count: 3,
    },
  ],
  telemetry: {
    'press-01': [
      { timestamp: NOW - 30_000, temperature_c: 61.9, vibration_mm_s: 2.0, state: 'running' },
      { timestamp: NOW, temperature_c: 62.4, vibration_mm_s: 2.05, state: 'running' },
    ],
  },
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMcpData', () => {
  it('does nothing at all until the live source is selected', () => {
    const { result } = renderHook(() => useMcpData({ enabled: false }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.connection.status).toBe('idle');
    expect(result.current.assets).toEqual([]);
  });

  it('exposes the same surface as the simulated hook', () => {
    const { result } = renderHook(() => useMcpData({ enabled: false }));
    for (const key of [
      'assets',
      'alarms',
      'history',
      'auditLogs',
      'lastUpdate',
      'acknowledge',
      'injectFault',
      'clearFaults',
      'addAuditLog',
    ]) {
      expect(result.current).toHaveProperty(key);
    }
  });

  it('reports live and maps the snapshot once the bridge answers', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SNAPSHOT));
    const { result } = renderHook(() => useMcpData({ enabled: true }));

    await waitFor(() => expect(result.current.connection.status).toBe('live'));

    expect(result.current.connection.server).toEqual({ name: 'telemetry', version: '0.1.0' });
    expect(result.current.assets).toHaveLength(1);
    expect(result.current.assets[0].spec.id).toBe('PRESS-01');
    expect(result.current.assets[0].values.temperature).toBe(62.4);
    expect(result.current.history['PRESS-01:temperature']).toHaveLength(2);
    expect(result.current.alarms[0]).toMatchObject({
      assetId: 'PRESS-01',
      metric: 'temperature',
      threshold: 77,
      peakValue: 90.2,
    });
    expect(result.current.lastUpdate).toBe(NOW);
  });

  it('asks the bridge for a snapshot over the configured window', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SNAPSHOT));
    renderHook(() => useMcpData({ enabled: true }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(`${BRIDGE_URL}/api/snapshot`);
    expect(String(url)).toContain('window_ms=');
    expect(String(url)).toContain('step_ms=');
  });

  it('holds no data and names the reason when the bridge reports the server down', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: 'unavailable', detail: 'spawn node ENOENT' }, 503),
    );
    const { result } = renderHook(() => useMcpData({ enabled: true }));

    await waitFor(() => expect(result.current.connection.status).toBe('unavailable'));

    expect(result.current.connection.detail).toBe('spawn node ENOENT');
    expect(result.current.assets).toEqual([]);
    expect(result.current.history).toEqual({});
  });

  it('names the reason when the bridge itself is not running', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useMcpData({ enabled: true }));

    await waitFor(() => expect(result.current.connection.status).toBe('unavailable'));
    expect(result.current.connection.detail).toBe('Failed to fetch');
    expect(result.current.assets).toEqual([]);
  });

  it('drops live data when the operator switches back to the simulator', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SNAPSHOT));
    const { result, rerender } = renderHook(({ enabled }) => useMcpData({ enabled }), {
      initialProps: { enabled: true },
    });

    await waitFor(() => expect(result.current.assets).toHaveLength(1));

    rerender({ enabled: false });

    expect(result.current.connection.status).toBe('idle');
    expect(result.current.assets).toEqual([]);
  });

  it('sends an injected fault to the server as a simulate_fault request', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SNAPSHOT));
    const { result } = renderHook(() => useMcpData({ enabled: true }));
    await waitFor(() => expect(result.current.connection.status).toBe('live'));

    await act(async () => {
      result.current.injectFault('PRESS-01', 'vibration');
    });

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(post).toBeDefined();
    expect(String(post?.[0])).toBe(`${BRIDGE_URL}/api/fault`);
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      device_id: 'press-01',
      fault_type: 'vibration',
    });
    expect(result.current.auditLogs[0]).toMatchObject({ action: 'inject', resourceId: 'PRESS-01' });
  });

  it('reports the server as unavailable when a fault cannot be sent', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(SNAPSHOT));
    const { result } = renderHook(() => useMcpData({ enabled: true }));
    await waitFor(() => expect(result.current.connection.status).toBe('live'));

    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await act(async () => {
      result.current.injectFault('PRESS-01');
    });

    await waitFor(() => expect(result.current.connection.status).toBe('unavailable'));
  });

  it('acknowledges locally and records that the transition never left the browser', async () => {
    fetchMock.mockResolvedValue(jsonResponse(SNAPSHOT));
    const { result } = renderHook(() => useMcpData({ enabled: true }));
    await waitFor(() => expect(result.current.alarms).toHaveLength(1));

    const alarmId = result.current.alarms[0].id;
    act(() => {
      result.current.acknowledge(alarmId);
    });

    expect(result.current.alarms[0].acknowledgedAt).toBeDefined();
    expect(result.current.auditLogs[0]).toMatchObject({
      action: 'acknowledge',
      resourceId: alarmId,
      details: { scope: 'local' },
    });
  });
});
