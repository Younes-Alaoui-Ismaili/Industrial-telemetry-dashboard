/**
 * Domain model for an industrial asset fleet.
 *
 * Terms follow plant convention: an asset is a machine, a metric is an
 * instrumented quantity with a unit and operating limits, and an alarm is a
 * lifecycle object rather than a message.
 */

export type AssetKind =
  | 'press'
  | 'spindle'
  | 'conveyor'
  | 'pump'
  | 'compressor'
  | 'chiller';

export type AssetState = 'running' | 'idle' | 'fault' | 'offline';

export type MetricKey = 'temperature' | 'vibration' | 'pressure' | 'speed' | 'cycles';

/** Result of comparing a reading against its operating limits. */
export type MetricLevel = 'normal' | 'warning' | 'alarm';

export type Severity = 'warning' | 'alarm';

/**
 * Alarm lifecycle states, following the model used by industrial alarm
 * management practice. Acknowledging is a transition, never a deletion, and an
 * alarm that returns to normal before being acknowledged keeps a distinct state
 * so the operator still sees that it happened.
 */
export type AlarmState =
  | 'unacknowledged'
  | 'acknowledged'
  | 'returned-unacknowledged'
  | 'cleared';

/** Static definition of one instrumented quantity on an asset. */
export interface MetricSpec {
  key: MetricKey;
  label: string;
  unit: string;
  decimals: number;
  /** Nominal operating value used by the simulator. */
  nominal: number;
  /** Peak absolute noise applied per tick. */
  jitter: number;
  /** Warning limit. Undefined for metrics that have no limit, such as counters. */
  warn?: number;
  /** Alarm limit. Undefined for metrics that have no limit. */
  alarm?: number;
  /** Monotonic counters accumulate instead of oscillating. */
  counter?: boolean;
}

/** Static definition of a machine. */
export interface AssetSpec {
  id: string;
  name: string;
  kind: AssetKind;
  /**
   * Identifier of the same machine on the companion telemetry server, when one
   * exists. Kept so both projects describe the same fleet.
   */
  sourceId?: string;
  metrics: MetricSpec[];
}

/** Live values for one asset. */
export interface Asset {
  spec: AssetSpec;
  state: AssetState;
  values: Partial<Record<MetricKey, number>>;
  lastSeen: number;
}

/** One historical sample of a single metric. */
export interface Sample {
  timestamp: number;
  value: number;
}

/** History keyed by `${assetId}:${metricKey}`. */
export type History = Record<string, Sample[]>;

export interface Alarm {
  id: string;
  assetId: string;
  metric: MetricKey;
  severity: Severity;
  /** Limit that was crossed, with the unit it is expressed in. */
  threshold: number;
  unit: string;
  decimals: number;
  raisedAt: number;
  peakValue: number;
  /** Set when the reading returned inside its limits. */
  clearedAt?: number;
  /** Set when an operator acknowledged it. */
  acknowledgedAt?: number;
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId: string;
  timestamp: string;
  details: Record<string, unknown>;
}
