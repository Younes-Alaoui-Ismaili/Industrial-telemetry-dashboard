import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useCloudData } from './useCloudData';

afterEach(() => { vi.unstubAllGlobals(); });
const now = 1700000000000;
function reply(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
function install(role = 'Reader') {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/health')) return reply({ role, deployment: 'local', provenance: 'simulated' });
    if (url.includes('/devices')) return reply({ devices: [{ id: 'press-01', name: 'Press', temperature_limit: 77, vibration_limit: 4.1, temperature_c: 90, vibration_mm_s: 2, state: 'fault', timestamp: now }] });
    if (url.includes('/acknowledgements')) return reply({ id: 'alarm-1', acknowledged_at: now + 100 });
    if (url.includes('/alarms')) return reply({ alarms: [{ id: 'alarm-1', device_id: 'press-01', metric: 'temperature', threshold: 77, raised_at: now, last_seen_at: now, peak_value: 90, cleared_at: null, acknowledged_at: null, acknowledged_by: null }] });
    if (url.includes('/telemetry')) return reply({ readings: [{ timestamp: now, temperature_c: 90, vibration_mm_s: 2, state: 'fault' }] });
    if (url.includes('/report')) return reply({ alarm_count: 1 });
    throw new Error('Unexpected URL: ' + url + String(init?.method));
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
it('does not contact the API until selected', async () => {
  const fetcher = install();
  renderHook(() => useCloudData({ enabled: false, token: '' }));
  expect(fetcher).not.toHaveBeenCalled();
});
it('maps persisted server alarm identity and actual configured limits', async () => {
  install();
  const { result } = renderHook(() => useCloudData({ enabled: true, token: 'test-token' }));
  await waitFor(() => expect(result.current.connection.status).toBe('live'));
  expect(result.current.alarms[0].id).toBe('alarm-1');
  expect(result.current.assets[0].spec.metrics.find(m => m.key === 'temperature')?.alarm).toBe(77);
  expect(result.current.deployment).toBe('local');
});
it('does not invent readings when the cloud API is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => reply({ error: 'source_unavailable' }, 503)));
  const { result } = renderHook(() => useCloudData({ enabled: true, token: '' }));
  await waitFor(() => expect(result.current.connection.status).toBe('unavailable'));
  expect(result.current.assets).toEqual([]);
  expect(result.current.history).toEqual({});
});
it('an operator acknowledges through the API, while a reader cannot', async () => {
  const fetcher = install('Operator');
  const { result } = renderHook(() => useCloudData({ enabled: true, token: 'operator-token' }));
  await waitFor(() => expect(result.current.isOperator).toBe(true));
  await act(async () => { await result.current.acknowledge('alarm-1'); });
  expect(fetcher.mock.calls.some(([url, init]) => url.endsWith('/alarm-1/acknowledgements') && init?.method === 'POST')).toBe(true);
});
