// @vitest-environment node
/**
 * Snapshot assembly, driven end to end through a fake child process: the calls
 * really cross an SDK client and an SDK server, they just never leave the
 * process.
 */

import { describe, it, expect } from 'vitest';
import { createSession } from '../src/session.js';
import { DEFAULT_STEP_MS, DEFAULT_WINDOW_MS, fetchSnapshot, injectFault } from '../src/telemetry.js';
import { fakeChildTransport, startFakeSession, FAKE_ANOMALY } from './fakeServer.js';

const NOW = 1_700_000_000_000;

async function sessionOn(options = {}) {
  const calls = [];
  const { child } = await startFakeSession({ ...options, calls });
  const session = createSession({
    command: 'irrelevant',
    createTransport: () => fakeChildTransport(child),
  });
  return { session, calls, child };
}

describe('fetchSnapshot', () => {
  it('assembles devices, anomalies and per device readings from the real tools', async () => {
    const { session, calls } = await sessionOn();

    const snapshot = await fetchSnapshot((tool, args) => session.call(tool, args), { now: NOW });

    expect(snapshot.fetchedAt).toBe(NOW);
    expect(snapshot.window).toEqual({
      start: NOW - DEFAULT_WINDOW_MS,
      end: NOW,
      step_ms: DEFAULT_STEP_MS,
    });
    expect(snapshot.devices.map((d) => d.id)).toEqual(['press-01', 'spindle-02']);
    expect(snapshot.anomalies).toEqual([FAKE_ANOMALY]);
    expect(Object.keys(snapshot.telemetry)).toEqual(['press-01', 'spindle-02']);
    expect(snapshot.telemetry['press-01']).toHaveLength(2);

    expect(calls.map((c) => c.tool).sort()).toEqual([
      'get_anomalies',
      'get_telemetry',
      'get_telemetry',
      'list_devices',
    ]);

    await session.close();
  });

  it('asks for one telemetry page per device inside the requested window', async () => {
    const { session, calls } = await sessionOn();

    await fetchSnapshot((tool, args) => session.call(tool, args), {
      now: NOW,
      windowMs: 60_000,
      stepMs: 5_000,
    });

    const telemetryCalls = calls.filter((c) => c.tool === 'get_telemetry');
    expect(telemetryCalls).toHaveLength(2);
    for (const call of telemetryCalls) {
      expect(call.args.start).toBe(NOW - 60_000);
      expect(call.args.end).toBe(NOW);
      expect(call.args.step_ms).toBe(5_000);
    }

    await session.close();
  });

  it('rejects when a tool fails, so no partial snapshot is passed off as complete', async () => {
    const { session } = await sessionOn({ failing: 'get_anomalies' });

    await expect(
      fetchSnapshot((tool, args) => session.call(tool, args), { now: NOW }),
    ).rejects.toThrow('device is not reachable');

    await session.close();
  });

  it('rejects when the server is not running at all', async () => {
    const session = createSession({
      command: 'missing',
      createTransport: () => ({
        start: () => Promise.reject(new Error('spawn missing ENOENT')),
        send: () => Promise.resolve(),
        close: () => Promise.resolve(),
      }),
    });

    await expect(
      fetchSnapshot((tool, args) => session.call(tool, args), { now: NOW }),
    ).rejects.toThrow('ENOENT');
  });
});

describe('injectFault', () => {
  it('forwards the fault to the server and returns what the server said', async () => {
    const { session, calls } = await sessionOn();

    const result = await injectFault((tool, args) => session.call(tool, args), {
      deviceId: 'press-01',
      faultType: 'combined',
      durationSeconds: 60,
    });

    expect(result.fault).toMatchObject({ device_id: 'press-01', type: 'combined' });
    expect(calls.at(-1)).toEqual({
      tool: 'simulate_fault',
      args: { device_id: 'press-01', fault_type: 'combined', duration_seconds: 60 },
    });

    await session.close();
  });

  it('omits optional arguments so the server applies its own defaults', async () => {
    const { session, calls } = await sessionOn();

    await injectFault((tool, args) => session.call(tool, args), { deviceId: 'spindle-02' });

    expect(calls.at(-1)).toEqual({ tool: 'simulate_fault', args: { device_id: 'spindle-02' } });

    await session.close();
  });
});
