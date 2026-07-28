/**
 * Shapes exchanged with the local bridge.
 *
 * These mirror the telemetry MCP server's tool output on the wire, snake_case
 * included, so the mapping into the dashboard's domain model is one explicit
 * step in one file rather than a slow drift of half converted objects.
 */

export type WireState = 'running' | 'idle' | 'fault';

/** Metrics the telemetry server reports. It has no pressure, speed or counters. */
export type WireMetric = 'temperature' | 'vibration';

export interface WireDevice {
  id: string;
  name: string;
  state: WireState;
  temperature_c: number;
  vibration_mm_s: number;
  timestamp: number;
}

export interface WireReading {
  timestamp: number;
  temperature_c: number;
  vibration_mm_s: number;
  state: WireState;
}

export interface WireAnomaly {
  id: string;
  device_id: string;
  metric: WireMetric;
  started_at: number;
  ended_at: number;
  peak_value: number;
  threshold: number;
  sample_count: number;
}

export interface ServerIdentity {
  name: string;
  version: string;
}

/** Successful answer from the bridge's snapshot route. */
export interface WireSnapshot {
  status: 'live';
  server?: ServerIdentity;
  fetchedAt: number;
  window: { start: number; end: number; step_ms: number };
  devices: WireDevice[];
  anomalies: WireAnomaly[];
  telemetry: Record<string, WireReading[]>;
}

/** Which data source the operator selected. */
export type DataSourceId = 'simulated' | 'mcp';

/**
 * State of the live source.
 *
 * `unavailable` is a first class outcome, not an error to swallow: it is what
 * the banner reports and what forces the visible fallback label.
 */
export type McpStatus = 'idle' | 'connecting' | 'live' | 'unavailable';

export interface McpConnection {
  status: McpStatus;
  /** Reason the live source is unavailable, as reported by the bridge or fetch. */
  detail?: string;
  server?: ServerIdentity;
  /** When the last attempt completed. Zero before the first attempt. */
  checkedAt: number;
}
