/**
 * Test doubles for the bridge.
 *
 * The bridge's whole job is to run a server as a child process and speak MCP to
 * it over that process's stdio, so the interesting failures are process
 * failures: the command does not start, the process dies mid session, a tool
 * answers with an error. All three are reproduced here against a FAKE child
 * process. No process is ever spawned by the test suite and nothing touches the
 * network.
 *
 * The fake child is a pair of in memory pipes. A real SDK server sits on the far
 * end of them, so the bytes on the wire are framed and parsed by the official
 * SDK at both ends: the tests exercise the bridge, not a hand written protocol.
 */

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

/**
 * A stand in for the object `child_process.spawn` returns: three streams, an
 * exit event, and a kill switch.
 */
export function createFakeChildProcess() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.pid = 4242;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    child.stdout.end();
    child.stdin.end();
    child.emit('exit', 0, null);
    return true;
  };
  return child;
}

/**
 * Client side transport over the fake child's pipes.
 *
 * `StdioServerTransport` is the SDK's newline delimited JSON transport over a
 * given readable and writable pair. Pointing it at the child's stdout and stdin
 * makes it the client end, which is what lets the bridge be driven without
 * spawning anything. The framing stays the SDK's.
 *
 * The stream transport has no notion of a process, so the child's exit is wired
 * to `onclose` here. That is what the real spawning transport does when the
 * process it started goes away, and it is the event the bridge relies on to
 * notice a server that died.
 */
export function fakeChildTransport(child) {
  const transport = new StdioServerTransport(child.stdout, child.stdin);
  child.on('exit', () => transport.onclose?.());
  return transport;
}

export const FAKE_DEVICES = [
  {
    id: 'press-01',
    name: 'Hydraulic Press',
    state: 'running',
    temperature_c: 62.4,
    vibration_mm_s: 2.05,
    timestamp: 1_700_000_000_000,
  },
  {
    id: 'spindle-02',
    name: 'CNC Spindle',
    state: 'fault',
    temperature_c: 76.1,
    vibration_mm_s: 1.42,
    timestamp: 1_700_000_000_000,
  },
];

export const FAKE_ANOMALY = {
  id: 'anom-1',
  device_id: 'spindle-02',
  metric: 'temperature',
  started_at: 1_699_999_880_000,
  ended_at: 1_700_000_000_000,
  peak_value: 76.1,
  threshold: 63,
  sample_count: 4,
};

/**
 * A minimal telemetry server exposing the same four tool names as the real one.
 * Payloads are fixed so assertions are exact.
 *
 * @param {{ failing?: string, calls?: Array<{tool: string, args: object}> }} options
 */
export function buildFakeTelemetryServer({ failing, calls } = {}) {
  const server = new Server(
    { name: 'fake-telemetry', version: '0.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ['list_devices', 'get_telemetry', 'get_anomalies', 'simulate_fault'].map((name) => ({
      name,
      description: `fake ${name}`,
      inputSchema: { type: 'object' },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = request.params.name;
    const args = request.params.arguments ?? {};
    calls?.push({ tool, args });

    if (tool === failing) {
      return { content: [{ type: 'text', text: 'device is not reachable' }], isError: true };
    }

    const structured = payloadFor(tool, args);
    return { content: [{ type: 'text', text: JSON.stringify(structured) }], structuredContent: structured };
  });

  return server;
}

function payloadFor(tool, args) {
  switch (tool) {
    case 'list_devices':
      return { count: FAKE_DEVICES.length, devices: FAKE_DEVICES };
    case 'get_anomalies':
      return {
        count: 1,
        window: { start: args.start, end: args.end, step_ms: args.step_ms },
        anomalies: [FAKE_ANOMALY],
      };
    case 'get_telemetry':
      return {
        device_id: args.device_id,
        start: args.start,
        end: args.end,
        step_ms: args.step_ms,
        total: 2,
        count: 2,
        offset: 0,
        has_more: false,
        readings: [
          {
            timestamp: args.start,
            temperature_c: 61.8,
            vibration_mm_s: 2.0,
            state: 'running',
          },
          {
            timestamp: args.end,
            temperature_c: 62.4,
            vibration_mm_s: 2.05,
            state: 'running',
          },
        ],
      };
    case 'simulate_fault':
      return {
        fault: {
          id: 'fault-1',
          device_id: args.device_id,
          type: args.fault_type ?? 'overheat',
          started_at: 1_700_000_000_000,
          ends_at: 1_700_000_300_000,
          duration_ms: 300_000,
        },
        message: 'fault injected',
      };
    default:
      return {};
  }
}

/** Wire a fake child process to a fake server and return both ends. */
export async function startFakeSession(options = {}) {
  const child = createFakeChildProcess();
  const server = buildFakeTelemetryServer(options);
  await server.connect(new StdioServerTransport(child.stdin, child.stdout));
  return { child, server };
}
