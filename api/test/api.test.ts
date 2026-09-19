import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import type { TelemetryStore } from '../src/types.js';

const reader = 'reader-test-token-abcdefghijklmnopqrstuvwxyz';
const operator = 'operator-test-token-abcdefghijklmnopqrstuvwxyz';
function setup(overrides: Partial<TelemetryStore> = {}) {
  const store = {
    health: async () => undefined, devices: async () => [],
    telemetry: async () => [], anomalies: async () => [], alarms: async () => [],
    ingest: async () => ({ accepted: 1, duplicates: 0 }),
    acknowledge: async () => ({ id: 'a1', acknowledged_at: 100 }),
    report: async () => ({ alarm_count: 0, acknowledged_count: 0, average_acknowledgement_ms: null }),
    ...overrides,
  } as TelemetryStore;
  return buildApp({ store, auth: { mode: 'local', readerToken: reader, operatorToken: operator }, logger: false });
}
test('anonymous requests and forged platform identity are refused', async () => {
  const app = await setup();
  try {
    assert.equal((await app.inject('/api/v1/devices')).statusCode, 401);
    assert.equal((await app.inject({ url: '/api/v1/devices', headers: { 'x-ms-client-principal': 'forged' } })).statusCode, 401);
  } finally { await app.close(); }
});
test('reader can read but cannot ingest or acknowledge', async () => {
  const app = await setup();
  const headers = { authorization: 'Bearer ' + reader };
  try {
    assert.equal((await app.inject({ url: '/api/v1/devices', headers })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/alarms/a1/acknowledgements', headers, payload: {} })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/v1/telemetry', headers, payload: {} })).statusCode, 403);
  } finally { await app.close(); }
});
test('operator identity is supplied by authentication rather than request body', async () => {
  let actualActor: unknown;
  const app = await setup({ acknowledge: async (_id, actor) => { actualActor = actor; return { id: 'a1' }; } });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/v1/alarms/a1/acknowledgements', headers: { authorization: 'Bearer ' + operator }, payload: {} });
    assert.equal(response.statusCode, 200);
    assert.equal(actualActor, 'local-operator');
  } finally { await app.close(); }
});
test('invalid measurements are refused before the store is called', async () => {
  let called = false;
  const app = await setup({ ingest: async () => { called = true; return { accepted: 1, duplicates: 0 }; } });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/v1/telemetry', headers: { authorization: 'Bearer ' + operator }, payload: { events: [{ event_id: 'x', temperature_c: 'hot' }] } });
    assert.equal(response.statusCode, 400);
    assert.equal(called, false);
  } finally { await app.close(); }
});
test('store unavailability is 503, without leaking the SQL error or substituting data', async () => {
  const app = await setup({ devices: async () => { throw new Error('private database hostname'); } });
  try {
    const response = await app.inject({ url: '/api/v1/devices', headers: { authorization: 'Bearer ' + reader } });
    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error, 'source_unavailable');
    assert.ok(!response.body.includes('private database'));
    assert.ok(!response.body.includes('simulator'));
  } finally { await app.close(); }
});
test('time ranges are bounded and ordered', async () => {
  const app = await setup();
  try {
    const response = await app.inject({ url: '/api/v1/telemetry?device_id=press-01&start=20&end=10', headers: { authorization: 'Bearer ' + reader } });
    assert.equal(response.statusCode, 400);
  } finally { await app.close(); }
});
test('OpenAPI describes the authenticated telemetry and acknowledgement operations', async () => {
  const app = await setup();
  try {
    const response = await app.inject('/api/v1/openapi.json');
    assert.equal(response.statusCode, 200);
    assert.ok(response.json().paths['/api/v1/telemetry'].post);
    const acknowledgement = response.json().paths['/api/v1/alarms/{id}/acknowledgements'].post;
    assert.ok(acknowledgement);
    assert.ok(acknowledgement.responses['200'].content['application/json'].schema.properties.acknowledged_at);
    assert.ok(response.json().paths['/api/v1/report'].get.responses['200'].content['application/json'].schema.properties.average_cleared_duration_ms);
  } finally { await app.close(); }
});
test('malformed and foreign browser origins cannot reach a write operation', async () => {
  let calls = 0;
  const app = await setup({ acknowledge: async () => { calls++; return {}; } });
  try {
    for (const origin of ['not a URL', 'https://foreign.example']) {
      const response = await app.inject({ method: 'POST', url: '/api/v1/alarms/a1/acknowledgements', headers: { authorization: 'Bearer ' + operator, origin }, payload: {} });
      assert.equal(response.statusCode, 403);
      assert.equal(response.json().error, 'origin_rejected');
    }
    assert.equal(calls, 0);
  } finally { await app.close(); }
});

test('production auth cannot silently fall back to local tokens', async () => {
  await assert.rejects(() => buildApp({ store: {} as TelemetryStore, auth: { mode: 'entra', tenantId: '', audience: '' }, logger: false }));
});
