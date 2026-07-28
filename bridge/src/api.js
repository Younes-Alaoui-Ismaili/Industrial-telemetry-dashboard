/**
 * The bridge's HTTP surface, expressed as a pure function of the request.
 *
 * `handle` takes a plain request description and returns a plain response, so
 * every route is testable without opening a socket. `server.js` is the only file
 * that knows about Node's http module.
 *
 * Failure is a first class answer here. When the MCP server is not running the
 * bridge answers 503 with the reason it actually got, and the dashboard prints
 * that reason. It never answers 200 with substitute data: that is the one
 * outcome this whole feature exists to avoid.
 */

import { fetchSnapshot, injectFault } from './telemetry.js';

/**
 * @param {{ method: string, path: string, query?: URLSearchParams, body?: unknown }} request
 * @param {{ session: { call: Function, state: Function }, now?: () => number }} deps
 */
export async function handle(request, { session, now = () => Date.now() }) {
  const { method, path } = request;

  if (method === 'GET' && path === '/api/health') {
    try {
      const fleet = await session.call('list_devices', { response_format: 'json' });
      return {
        status: 200,
        body: {
          status: 'live',
          server: session.state().server,
          deviceCount: fleet?.count ?? fleet?.devices?.length ?? 0,
        },
      };
    } catch (error) {
      return unavailable(error);
    }
  }

  if (method === 'GET' && path === '/api/snapshot') {
    try {
      const snapshot = await fetchSnapshot((tool, args) => session.call(tool, args), {
        now: now(),
        windowMs: numberParam(request.query, 'window_ms'),
        stepMs: numberParam(request.query, 'step_ms'),
      });
      return { status: 200, body: { status: 'live', server: session.state().server, ...snapshot } };
    } catch (error) {
      return unavailable(error);
    }
  }

  if (method === 'POST' && path === '/api/fault') {
    const body = request.body ?? {};
    const deviceId = typeof body.device_id === 'string' ? body.device_id.trim() : '';
    if (deviceId === '') {
      return { status: 400, body: { status: 'error', detail: 'device_id is required.' } };
    }
    try {
      const result = await injectFault((tool, args) => session.call(tool, args), {
        deviceId,
        faultType: typeof body.fault_type === 'string' ? body.fault_type : undefined,
        durationSeconds:
          typeof body.duration_seconds === 'number' ? body.duration_seconds : undefined,
      });
      return { status: 200, body: { status: 'live', ...result } };
    } catch (error) {
      return unavailable(error);
    }
  }

  return { status: 404, body: { status: 'error', detail: `No route for ${method} ${path}.` } };
}

function unavailable(error) {
  return {
    status: 503,
    body: {
      status: 'unavailable',
      detail: error instanceof Error ? error.message : String(error),
    },
  };
}

function numberParam(query, key) {
  const raw = query?.get(key);
  if (raw === null || raw === undefined || raw === '') return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}
