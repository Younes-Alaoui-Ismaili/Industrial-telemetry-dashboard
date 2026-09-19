import type sql from 'mssql';
import type { AuthConfig } from './auth.js';
export function sqlConfiguration(): string | sql.config {
  if (!process.env.WEBSITE_SITE_NAME && process.env.SQL_CONNECTION_STRING) return process.env.SQL_CONNECTION_STRING;
  if (!process.env.SQL_SERVER || !process.env.SQL_DATABASE) throw new Error('SQL_SERVER and SQL_DATABASE are required');
  return {
    server: process.env.SQL_SERVER, database: process.env.SQL_DATABASE,
    authentication: { type: 'azure-active-directory-default', options: {} },
    options: { encrypt: true, trustServerCertificate: false },
    pool: { min: 0, max: 4, idleTimeoutMillis: 10000 },
    connectionTimeout: 15000, requestTimeout: 15000,
  };
}
export function authConfiguration(): AuthConfig {
  if (process.env.AUTH_MODE === 'local' && !process.env.WEBSITE_SITE_NAME) {
    return { mode: 'local', readerToken: process.env.LOCAL_READER_TOKEN ?? '', operatorToken: process.env.LOCAL_OPERATOR_TOKEN ?? '' };
  }
  return { mode: 'entra', tenantId: process.env.ENTRA_TENANT_ID ?? '', audience: process.env.ENTRA_AUDIENCE ?? '', platformAuth: Boolean(process.env.WEBSITE_SITE_NAME) && process.env.REQUIRE_PLATFORM_AUTH === 'true' };
}
