/**
 * The four telemetry tool calls, assembled into the two operations the dashboard
 * actually performs: read a snapshot of the plant, and inject a fault.
 *
 * Everything here takes a `call(tool, args)` function rather than a session, so
 * the assembly logic can be exercised against any MCP server, real or fake,
 * without this module knowing how the connection was made. Nothing is invented
 * on this side: whatever the tools return is passed through, and a tool that
 * fails is allowed to reject.
 */

/** Telemetry window requested on every snapshot. */
export const DEFAULT_WINDOW_MS = 900_000;

/** Sampling step. The server caps this at one hour and floors it at one second. */
export const DEFAULT_STEP_MS = 30_000;

/** Readings pulled per device. The window divided by the step never exceeds this. */
export const MAX_READINGS = 120;

/**
 * One round of reads: the fleet with its latest values, the anomalies the server
 * detected in the window, and the readings behind them.
 *
 * @param {(tool: string, args?: object) => Promise<any>} call
 * @param {{ now: number, windowMs?: number, stepMs?: number }} options
 */
export async function fetchSnapshot(call, { now, windowMs = DEFAULT_WINDOW_MS, stepMs = DEFAULT_STEP_MS }) {
  const end = now;
  const start = end - windowMs;
  const window = { start, end, step_ms: stepMs };

  const fleet = await call('list_devices', { response_format: 'json' });
  const devices = fleet?.devices ?? [];

  const [detected, pages] = await Promise.all([
    call('get_anomalies', { start, end, step_ms: stepMs, response_format: 'json' }),
    Promise.all(
      devices.map((device) =>
        call('get_telemetry', {
          device_id: device.id,
          start,
          end,
          step_ms: stepMs,
          limit: MAX_READINGS,
          response_format: 'json',
        }),
      ),
    ),
  ]);

  /** @type {Record<string, unknown[]>} */
  const telemetry = {};
  devices.forEach((device, index) => {
    telemetry[device.id] = pages[index]?.readings ?? [];
  });

  return {
    fetchedAt: now,
    window,
    devices,
    anomalies: detected?.anomalies ?? [],
    telemetry,
  };
}

/**
 * Drive one machine into a fault on the server. The dashboard shows the result
 * only because the server's own readings move, never because the client faked it.
 *
 * @param {(tool: string, args?: object) => Promise<any>} call
 * @param {{ deviceId: string, faultType?: string, durationSeconds?: number }} options
 */
export async function injectFault(call, { deviceId, faultType, durationSeconds }) {
  /** @type {Record<string, unknown>} */
  const args = { device_id: deviceId };
  if (faultType !== undefined) args.fault_type = faultType;
  if (durationSeconds !== undefined) args.duration_seconds = durationSeconds;
  return call('simulate_fault', args);
}
