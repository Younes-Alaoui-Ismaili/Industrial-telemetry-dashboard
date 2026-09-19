import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { SqlStore } from '../src/store.js';
test('anomaly peaks are computed only from samples inside the requested window', async () => {
 assert.ok(process.env.SQL_CONNECTION_STRING);
 const store=await SqlStore.connect(process.env.SQL_CONNECTION_STRING!);
 try {
  await store.migrate();
  const id='window-'+randomUUID().slice(0,8), time=Date.now()-10000;
  await store.registerDevice({id,name:'Window test',temperature_limit:80,vibration_limit:4},'test');
  await store.ingest([95,91,40].map((temperature_c,i)=>({event_id:randomUUID(),device_id:id,timestamp:time+i*1000,temperature_c,vibration_mm_s:1,state:'running',provenance:'simulated'})),'test');
  const rows=await store.anomalies(id,time+1000,time+1000);
  assert.equal(rows.length,1);
  assert.equal(rows[0].peak_value,91);
  assert.equal(rows[0].sample_count,1);
 } finally { await store.close(); }
});
