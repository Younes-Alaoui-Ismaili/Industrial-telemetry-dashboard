import { SqlStore } from './store.js';
import { buildApp } from './app.js';
import { sqlConfiguration, authConfiguration } from './config.js';

const store = await SqlStore.connect(sqlConfiguration());
const app = await buildApp({ store, auth: authConfiguration(), deployment: process.env.WEBSITE_SITE_NAME ? 'azure' : 'local' });
const shutdown = async () => { await app.close(); await store.close(); };
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
await app.listen({ host: process.env.WEBSITE_SITE_NAME ? '0.0.0.0' : '127.0.0.1', port: Number(process.env.PORT ?? 4100) });
