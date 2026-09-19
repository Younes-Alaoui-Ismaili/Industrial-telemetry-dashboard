export interface Device { id: string; name: string; temperature_limit: number; vibration_limit: number }
export interface Measurement {
  event_id: string; device_id: string; timestamp: number; temperature_c: number;
  vibration_mm_s: number; state: 'running' | 'idle' | 'fault'; provenance: 'simulated';
}
export interface AlarmRecord {
  id: string; device_id: string; metric: 'temperature' | 'vibration'; threshold: number;
  raised_at: number; last_seen_at: number; peak_value: number; cleared_at: number | null;
  acknowledged_at: number | null; acknowledged_by: string | null;
}
export interface TelemetryStore {
  health(): Promise<void>;
  registerDevice(device: Device, actor: string): Promise<Device>;
  devices(): Promise<unknown[]>;
  telemetry(device: string, start: number, end: number): Promise<unknown[]>;
  anomalies(device: string | undefined, start: number, end: number): Promise<unknown[]>;
  alarms(device?: string): Promise<AlarmRecord[]>;
  ingest(events: Measurement[], actor: string): Promise<{ accepted: number; duplicates: number }>;
  acknowledge(id: string, actor: string): Promise<unknown>;
  report(start: number, end: number): Promise<unknown>;
}
export class DomainError extends Error {
  constructor(public statusCode: number, public code: string) { super(code); }
}
