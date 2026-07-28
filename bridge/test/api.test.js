// @vitest-environment node
/**
 * Routing, with the degradation path asserted explicitly: when the MCP server is
 * down the bridge answers 503 and says why. A 200 with substitute readings would
 * be the failure this feature exists to prevent, so it is tested for.
 */

import { describe, it, expect } from 'vitest';
import { handle } from '../src/api.js';

const NOW = 1_700_000_000_000;

function liveSession(calls = []) {
  return {
    call: async (tool, args) => {
      calls.push({ tool, args });
      if (tool === 'list_devices') return { count: 1, devices: [{ id: 'press-01' }] };
      if (tool === 'get_anomalies') return { anomalies: [] };
      if (tool === 'get_telemetry') return { readings: [{ timestamp: NOW }] };
      if (tool === 'simulate_fault') return { fault: { id: 'f1', device_id: args.device_id } };
      return {};
    },
    state: () => ({ status: 'connected', server: { name: 'fake', version: '0.0.0' } }),
  };
}

function downSession(message = 'spawn node ENOENT') {
  return {
    call: async () => {
      throw new Error(message);
    },
    state: () => ({ status: 'unavailable', detail: message }),
  };
}

const deps = (session) => ({ session, now: () => NOW });

describe('GET /api/health', () => {
  it('answers 200 with the server identity when the connection works', async () => {
    const response = await handle({ method: 'GET', path: '/api/health' }, deps(liveSession()));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'live', deviceCount: 1 });
    expect(response.body.server).toEqual({ name: 'fake', version: '0.0.0' });
  });

  it('answers 503 and names the reason when the server is down', async () => {
    const response = await handle({ method: 'GET', path: '/api/health' }, deps(downSession()));
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable', detail: 'spawn node ENOENT' });
  });
});

describe('GET /api/snapshot', () => {
  it('returns the assembled snapshot', async () => {
    const response = await handle({ method: 'GET', path: '/api/snapshot' }, deps(liveSession()));
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('live');
    expect(response.body.fetchedAt).toBe(NOW);
    expect(response.body.devices).toEqual([{ id: 'press-01' }]);
    expect(response.body.telemetry['press-01']).toHaveLength(1);
  });

  it('honours the window and step query parameters', async () => {
    const calls = [];
    await handle(
      {
        method: 'GET',
        path: '/api/snapshot',
        query: new URLSearchParams({ window_ms: '60000', step_ms: '5000' }),
      },
      deps(liveSession(calls)),
    );

    const telemetry = calls.find((c) => c.tool === 'get_telemetry');
    expect(telemetry.args).toMatchObject({ start: NOW - 60_000, end: NOW, step_ms: 5_000 });
  });

  it('never substitutes data when the server is down: it answers 503', async () => {
    const response = await handle(
      { method: 'GET', path: '/api/snapshot' },
      deps(downSession('connection closed')),
    );
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable', detail: 'connection closed' });
    expect(response.body.devices).toBeUndefined();
  });
});

describe('POST /api/fault', () => {
  it('forwards a fault to the server', async () => {
    const calls = [];
    const response = await handle(
      { method: 'POST', path: '/api/fault', body: { device_id: 'press-01', fault_type: 'overheat' } },
      deps(liveSession(calls)),
    );
    expect(response.status).toBe(200);
    expect(calls.at(-1).tool).toBe('simulate_fault');
    expect(response.body.fault).toMatchObject({ device_id: 'press-01' });
  });

  it('rejects a request with no device', async () => {
    const response = await handle(
      { method: 'POST', path: '/api/fault', body: { device_id: '  ' } },
      deps(liveSession()),
    );
    expect(response.status).toBe(400);
    expect(response.body.detail).toContain('device_id');
  });

  it('answers 503 when the server is down', async () => {
    const response = await handle(
      { method: 'POST', path: '/api/fault', body: { device_id: 'press-01' } },
      deps(downSession()),
    );
    expect(response.status).toBe(503);
  });
});

describe('unknown routes', () => {
  it('answers 404', async () => {
    const response = await handle({ method: 'GET', path: '/nope' }, deps(liveSession()));
    expect(response.status).toBe(404);
    expect(response.body.detail).toContain('/nope');
  });
});
