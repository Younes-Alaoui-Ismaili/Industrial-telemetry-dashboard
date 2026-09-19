const string = { type: 'string' };
const number = { type: 'number' };
const integer = { type: 'integer' };
const timestamp = { type: 'integer', description: 'Unix epoch milliseconds' };
const nullableTime = { ...timestamp, nullable: true };
const duration = { type: 'number', nullable: true, description: 'Milliseconds; null when there are no completed observations in the cohort' };
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: true, properties });
const array = (items: object) => ({ type: 'array', items });
const provenance = { type: 'string', enum: ['simulated'] };
const state = { type: 'string', enum: ['running', 'idle', 'fault'] };
const equipment = { id: string, name: string, temperature_limit: number, vibration_limit: number };
const reading = { event_id: string, timestamp, temperature_c: { ...number, description: 'Degrees Celsius' }, vibration_mm_s: { ...number, description: 'Millimetres per second' }, state, provenance };
const window = object({ start: timestamp, end: timestamp });
const alarm = object({ id: string, device_id: string, metric: { type: 'string', enum: ['temperature', 'vibration'] }, threshold: number, raised_at: timestamp, last_seen_at: timestamp, peak_value: number, cleared_at: nullableTime, acknowledged_at: nullableTime, acknowledged_by: { type: 'string', nullable: true } });
export const responseContracts: Record<string, object> = {
  'GET /api/v1/health': object({ status: { type: 'string', enum: ['ready'] }, deployment: { type: 'string', enum: ['local', 'azure'] }, provenance, role: { type: 'string', enum: ['Reader', 'Operator'] } }),
  'GET /api/v1/devices': object({ devices: array(object({ ...equipment, ...reading })) }),
  'POST /api/v1/devices': object(equipment),
  'POST /api/v1/telemetry': object({ accepted: integer, duplicates: integer }),
  'GET /api/v1/telemetry': object({ device_id: string, start: timestamp, end: timestamp, provenance, readings: array(object(reading)) }),
  'GET /api/v1/alarms': object({ alarms: array(alarm) }),
  'POST /api/v1/alarms/:id/acknowledgements': alarm,
  'GET /api/v1/anomalies': object({ window, anomalies: array(object({ id: string, device_id: string, metric: string, threshold: number, peak_value: number, started_at: timestamp, ended_at: timestamp, sample_count: integer })) }),
  'GET /api/v1/report': object({ window, alarm_count: integer, acknowledged_count: integer, cleared_count: integer, average_acknowledgement_ms: duration, average_cleared_duration_ms: duration, units: { type: 'string', enum: ['milliseconds'] }, basis: string, provenance }),
};
