import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SqlStore } from '../src/store.js';

test('real SQL persists idempotent ingestion, cross-session acknowledgement and recovery', async () => {
  assert.ok(process.env.SQL_CONNECTION_STRING, 'SQL_CONNECTION_STRING is required; this suite never substitutes a memory store');
  const store = await SqlStore.connect(process.env.SQL_CONNECTION_STRING!);
  await store.migrate();
  const device = 'test-' + randomUUID().slice(0, 8);
  const now = Date.now() - 10000;
  const event = { event_id: randomUUID(), device_id: device, timestamp: now, temperature_c: 95, vibration_mm_s: 1, state: 'fault' as const, provenance: 'simulated' as const };
  try {
    await store.registerDevice({ id: device, name: 'Integration test', temperature_limit: 80, vibration_limit: 4 }, 'integration-test');
    const result = await store.ingest([event], 'integration-test');
    assert.equal(result.accepted, 1);
    assert.equal((await store.ingest([event], 'integration-test')).duplicates, 1);
    await assert.rejects(() => store.ingest([{ ...event, temperature_c: 96 }], 'integration-test'), /conflict/i);
    const before = await store.alarms(device);
    assert.equal(before.length, 1);
    const id = before[0].id;
    await store.acknowledge(id, 'operator-one');
    await store.acknowledge(id, 'operator-two');
    await store.close();
    const reopened = await SqlStore.connect(process.env.SQL_CONNECTION_STRING!);
    try {
      const alarms = await reopened.alarms(device);
      assert.equal(alarms[0].acknowledged_by, 'operator-one');
      assert.equal((await reopened.telemetry(device, now - 1, now + 1)).length, 1);
      await reopened.ingest([{ ...event, event_id: randomUUID(), timestamp: now + 1000, temperature_c: 40, state: 'running' }], 'integration-test');
      assert.equal((await reopened.alarms(device))[0].cleared_at, now + 1000);
      const backup = await reopened.exportData();
      assert.ok(backup.sha256);
      assert.ok(backup.data.events.some((e: { device_id: string }) => e.device_id === device));
    } finally { await reopened.close(); }
  } finally { await store.close(); }
});
