import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
const root = new URL('./', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, root), 'utf8'));
const source = read('azure-source.local.json');
const state = read('state.local.json');
const base = process.env.TB_URL || 'http://127.0.0.1:18080';
const login = await fetch(base + '/api/auth/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username: 'tenant@thingsboard.org', password: 'tenant'})});
assert.equal(login.status, 200);
const {token} = await login.json();
async function get(path) {
  const r = await fetch(base + path, {headers: {'X-Authorization': `Bearer ${token}`}, signal: AbortSignal.timeout(15000)});
  assert.equal(r.status, 200, path);
  return r.json();
}
const dashboard = await get(`/api/dashboard/${state.dashboardId}`);
assert.equal(dashboard.title, 'Industrial Process Monitoring and Analytics');
assert.equal(Object.keys(dashboard.configuration.widgets).length, 4);
let points = 0;
for (const device of source.devices) {
  const id = state.devices[device.id];
  const rows = source.streams[device.id];
  const start = Math.min(...rows.map(r => r.timestamp));
  const end = Math.max(...rows.map(r => r.timestamp)) + 1;
  const actual = await get(`/api/plugins/telemetry/DEVICE/${id}/values/timeseries?keys=temperature_c,vibration_mm_s&startTs=${start}&endTs=${end}&agg=NONE&limit=10000`);
  for (const key of ['temperature_c', 'vibration_mm_s']) {
    assert.equal(actual[key].length, rows.length);
    for (const row of rows) assert.equal(Number(actual[key].find(r => r.ts === row.timestamp)?.value), row[key]);
    points += actual[key].length;
  }
}
for (const alarm of source.alarms) {
  const actual = await get(`/api/alarm/${state.alarms[alarm.id]}`);
  assert.equal(actual.details.source_alarm_id, alarm.id);
  assert.equal(actual.startTs, alarm.raised_at);
  assert.equal(actual.acknowledged, !!alarm.acknowledged_at);
  assert.equal(actual.cleared, !!alarm.cleared_at);
}
const report = {checkedAt: new Date().toISOString(), mode: 'read-only', passed: true, dashboardId: state.dashboardId, devices: source.devices.length, metricPoints: points, alarms: source.alarms.length, originalValuesAndTimestamps: true};
writeFileSync(new URL('persistence-verification.local.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
