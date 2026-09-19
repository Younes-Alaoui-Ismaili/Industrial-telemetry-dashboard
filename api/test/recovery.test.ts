import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SqlStore } from '../src/store.js';
test('export/import into an empty SQL database preserves the data digest and refuses overwrite', async () => {
  assert.ok(process.env.SQL_CONNECTION_STRING && process.env.SQL_RESTORE_CONNECTION_STRING, 'Separate source and empty destination connections required');
  assert.notEqual(process.env.SQL_CONNECTION_STRING, process.env.SQL_RESTORE_CONNECTION_STRING);
  const source = await SqlStore.connect(process.env.SQL_CONNECTION_STRING!);
  const destination = await SqlStore.connect(process.env.SQL_RESTORE_CONNECTION_STRING!);
  try {
    await destination.migrate();
    const backup = await source.exportData();
    assert.ok(backup.data.events.length > 0);
    await assert.rejects(() => destination.importData({ ...backup, sha256: 'invalid' }), /checksum/);
    await destination.importData(backup);
    assert.equal((await destination.exportData()).sha256, backup.sha256);
    await assert.rejects(() => destination.importData(backup), /empty_database/);
    console.log(JSON.stringify({ sha256: backup.sha256, rows: Object.fromEntries(Object.entries(backup.data).map(([k,v]) => [k,v.length])) }));
  } finally { await source.close(); await destination.close(); }
});
