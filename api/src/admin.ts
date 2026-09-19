import { readFile, writeFile } from 'node:fs/promises';
import { SqlStore, type Backup } from './store.js';
import { sqlConfiguration } from './config.js';
const [command, file] = process.argv.slice(2);
if (!['migrate', 'backup', 'restore'].includes(command) || (command !== 'migrate' && !file)) throw new Error('Usage: admin migrate | backup FILE | restore FILE');
const store = await SqlStore.connect(sqlConfiguration());
try {
  if (command === 'migrate') { await store.migrate(); console.log('Migration 1 applied or already present'); }
  if (command === 'backup') {
    const backup = await store.exportData();
    await writeFile(file, JSON.stringify(backup, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ sha256: backup.sha256, rows: Object.fromEntries(Object.entries(backup.data).map(([table, rows]) => [table, rows.length])) }));
  }
  if (command === 'restore') console.log(JSON.stringify(await store.importData(JSON.parse(await readFile(file, 'utf8')) as Backup)));
} finally { await store.close(); }
