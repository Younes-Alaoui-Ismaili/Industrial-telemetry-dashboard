import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDashboard } from './dashboard.mjs';
const upstream = JSON.parse(readFileSync(new URL('./upstream-thermostats.json', import.meta.url)));
test('industrial board retains native widgets and valid layout references', () => {
  const board = buildDashboard(upstream);
  const config = board.configuration;
  assert.equal(Object.keys(config.widgets).length, 4);
  for (const state of Object.values(config.states)) {
    for (const id of Object.keys(state.layouts.main.widgets)) assert.ok(config.widgets[id]);
  }
  assert.match(board.title, /Industrial/);
  assert.ok(Object.values(config.widgets).some(w => w.typeFullFqn === 'system.alarm_widgets.alarms_table'));
});
test('every chart uses the fleet alias and original telemetry units', () => {
  const config = buildDashboard(upstream).configuration;
  const charts = Object.values(config.widgets).filter(w => w.type === 'timeseries');
  assert.equal(charts.length, 2);
  assert.deepEqual(charts.map(w => w.config.datasources[0].dataKeys[0].name), ['temperature_c', 'vibration_mm_s']);
  assert.deepEqual(charts.map(w => w.config.datasources[0].dataKeys[0].units), ['°C', 'mm/s']);
  for (const chart of charts) assert.equal(config.entityAliases[chart.config.datasources[0].entityAliasId].filter.deviceTypes[0], 'industrial-telemetry');
  assert.equal(JSON.stringify(config).includes('customFunction'), false);
});
