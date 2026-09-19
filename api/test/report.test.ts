import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SqlStore } from '../src/store.js';

test('real SQL report counts episodes and uses completed durations in milliseconds', async () => {
  assert.ok(process.env.SQL_CONNECTION_STRING);
  const store = await SqlStore.connect(process.env.SQL_CONNECTION_STRING!);
  const device = 'report-' + randomUUID().slice(0, 8);
  const at = Date.now() - 3600000;
  const event = { event_id: randomUUID(), device_id: device, timestamp: at, temperature_c: 95, vibration_mm_s: 6, state: 'fault' as const, provenance: 'simulated' as const };
  try {
    await store.migrate();
    await store.registerDevice({ id: device, name: 'Report verification', temperature_limit: 80, vibration_limit: 4 }, 'report-test');
    await store.ingest([event], 'report-test');
    const [alarm] = await store.alarms(device);
    const acknowledged = await store.acknowledge(alarm.id, 'report-operator') as { acknowledged_at: number };
    // Temperature returns to normal while vibration remains above its threshold.
    await store.ingest([{ ...event, event_id: randomUUID(), timestamp: at + 1500, temperature_c: 40 }], 'report-test');
    const report = await store.report(at, at) as Record<string, unknown>;
    assert.equal(report.alarm_count, 2);
    assert.equal(report.acknowledged_count, 1);
    assert.equal(report.average_acknowledgement_ms, acknowledged.acknowledged_at - at);
    assert.equal(report.cleared_count, 1);
    assert.equal(report.average_cleared_duration_ms, 1500);
    assert.equal(report.units, 'milliseconds');
    const empty = await store.report(at + 1, at + 1) as Record<string, unknown>;
    assert.equal(empty.alarm_count, 0);
    assert.equal(empty.average_acknowledgement_ms, null);
    assert.equal(empty.average_cleared_duration_ms, null);
    const backup = await store.exportData();
    assert.equal(backup.data.audit.filter(row => row.action === 'alarm_acknowledged' && row.resource_id === alarm.id && row.actor === 'report-operator').length, 1);
  } finally { await store.close(); }
});
