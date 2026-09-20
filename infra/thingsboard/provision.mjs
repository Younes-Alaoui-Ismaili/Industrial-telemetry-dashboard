import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { buildDashboard } from './dashboard.mjs';
const root = new URL('./', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const save = (name, value) => writeFileSync(new URL(name, root), JSON.stringify(value, null, 2) + '\n');
const base = process.env.TB_URL || 'http://127.0.0.1:18080';
let token;
async function api(path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + path, {
    method, signal: AbortSignal.timeout(60000),
    headers: {'Content-Type': 'application/json', ...(token ? {'X-Authorization': `Bearer ${token}`} : {})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)})
  });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
const credentials = existsSync(new URL('credentials.local.json', root)) ? read('credentials.local.json') : {username: 'tenant@thingsboard.org', password: 'tenant'};
token = (await api('/api/auth/login', credentials)).token;
const source = read('azure-source.local.json');
const state = existsSync(new URL('state.local.json', root)) ? read('state.local.json') : {devices: {}, alarms: {}};
let readings = 0;
for (const sourceDevice of source.devices) {
  let device;
  const page = await api('/api/tenant/devices?pageSize=100&page=0');
  device = page.data.find(d => d.name === sourceDevice.id);
  if (!device) device = await api('/api/device', {name: sourceDevice.id, label: sourceDevice.name, type: 'industrial-telemetry', additionalInfo: {description: 'Read-only copy of synthetic Azure telemetry. Original timestamps retained.'}});
  state.devices[sourceDevice.id] = device.id.id;
  save('state.local.json', state);
  await api(`/api/plugins/telemetry/DEVICE/${device.id.id}/SERVER_SCOPE`, {temperature_limit: sourceDevice.temperature_limit, vibration_limit: sourceDevice.vibration_limit, source: source.source, source_checked_at: source.checkedAt, measured_at: new Date(sourceDevice.timestamp).toISOString()});
  const points = source.streams[sourceDevice.id].map(r => ({ts: r.timestamp, values: {temperature_c: r.temperature_c, vibration_mm_s: r.vibration_mm_s, state: r.state, provenance: 'simulated / Azure', event_id: r.event_id}}));
  if (points.length) await api(`/api/plugins/telemetry/DEVICE/${device.id.id}/timeseries/ANY`, points);
  readings += points.length;
}
const alarmCreationTimes = [];
for (const alarm of source.alarms) {
  const payload = {name: `Azure ${alarm.metric}`, type: `Azure ${alarm.metric} / ${alarm.id}`, originator: {entityType: 'DEVICE', id: state.devices[alarm.device_id]}, severity: 'MAJOR', startTs: alarm.raised_at, endTs: alarm.last_seen_at, ackTs: alarm.acknowledged_at || 0, clearTs: alarm.cleared_at || 0, acknowledged: !!alarm.acknowledged_at, cleared: !!alarm.cleared_at, details: {source_alarm_id: alarm.id, threshold: alarm.threshold, peak_value: alarm.peak_value, provenance: 'simulated / Azure', source_checked_at: source.checkedAt}};
  if (state.alarms[alarm.id]) payload.id = {entityType: 'ALARM', id: state.alarms[alarm.id]};
  const saved = await api('/api/alarm', payload);
  state.alarms[alarm.id] = saved.id.id;
  alarmCreationTimes.push(saved.createdTime);
  save('state.local.json', state);
}
const board = buildDashboard(read('upstream-thermostats.json'));
const timestamps = Object.values(source.streams).flat().map(r => r.timestamp);
const startTimeMs = Math.min(...timestamps);
const endTimeMs = Math.max(...timestamps) + 1000;
board.configuration.timewindow = {selectedTab: 1, history: {historyType: 1, fixedTimewindow: {startTimeMs, endTimeMs}, interval: 1000}, aggregation: {type: 'NONE', limit: 10000}};
for (const widget of Object.values(board.configuration.widgets)) {
  if (widget.typeFullFqn === 'system.alarm_widgets.alarms_table') {
    widget.config.title = 'Azure alarm history | Local copy';
    widget.config.useDashboardTimewindow = false;
    widget.config.timewindow = {selectedTab: 1, history: {historyType: 1, fixedTimewindow: {startTimeMs: Math.min(...alarmCreationTimes) - 1000, endTimeMs: Math.max(...alarmCreationTimes) + 1000}, interval: 1000}, aggregation: {type: 'NONE', limit: 1000}};
    widget.config.displayTimewindow = false;
    widget.config.settings.enableSelection = false;
    widget.config.settings.enableDelete = false;
    widget.config.settings.allowAcknowledgment = false;
    widget.config.settings.allowClear = false;
    widget.config.settings.allowAssign = false;
  }
}
if (state.dashboardId) board.id = {entityType: 'DASHBOARD', id: state.dashboardId};
const savedBoard = state.dashboardId && !process.argv.includes('--rebuild')
  ? await api(`/api/dashboard/${state.dashboardId}`)
  : await api('/api/dashboard', board);
state.dashboardId = savedBoard.id.id;
save('state.local.json', state);
save('dashboard.json', savedBoard);
const verification = [];
for (const [name, id] of Object.entries(state.devices)) {
  const points = await api(`/api/plugins/telemetry/DEVICE/${id}/values/timeseries?keys=temperature_c,vibration_mm_s&startTs=${startTimeMs}&endTs=${endTimeMs}&limit=10000&agg=NONE`);
  const expected = source.streams[name];
  if (points.temperature_c?.length !== expected.length || points.vibration_mm_s?.length !== expected.length) throw new Error(`Persisted point count mismatch for ${name}`);
  for (const r of expected) {
    const actual = points.temperature_c.find(p => p.ts === r.timestamp);
    if (!actual || Number(actual.value) !== r.temperature_c) throw new Error(`Persisted value mismatch for ${name}`);
  }
  verification.push({name, temperaturePoints: points.temperature_c.length, vibrationPoints: points.vibration_mm_s.length});
}
const report = {checkedAt: new Date().toISOString(), sourceCheckedAt: source.checkedAt, url: `${base}/dashboard/${state.dashboardId}`, source: source.source, synthetic: true, readings, originalTimestampsPreserved: true, devices: verification, alarms: Object.keys(state.alarms).length};
save('verification.local.json', report);
console.log(JSON.stringify(report, null, 2));
