import { createHash, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { FastifyRequest } from 'fastify';

export type AuthConfig =
  | { mode: 'local'; readerToken: string; operatorToken: string }
  | { mode: 'entra'; tenantId: string; audience: string; platformAuth?: boolean };
export interface Identity { id: string; operator: boolean }
function same(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
export function authenticator(config: AuthConfig) {
  if (config.mode === 'local') {
    if (config.readerToken.length < 32 || config.operatorToken.length < 32 || same(config.readerToken, config.operatorToken)) {
      throw new Error('Distinct local tokens of at least 32 characters are required');
    }
    return async (request: FastifyRequest): Promise<Identity | null> => {
      const token = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
      if (same(token, config.operatorToken)) return { id: 'local-operator', operator: true };
      if (same(token, config.readerToken)) return { id: 'local-reader', operator: false };
      return null;
    };
  }
  if (!/^[a-f0-9-]{36}$/i.test(config.tenantId) || !config.audience) throw new Error('Entra tenant and audience are required');
  const issuer = 'https://login.microsoftonline.com/' + config.tenantId + '/v2.0';
  const jwks = createRemoteJWKSet(new URL('https://login.microsoftonline.com/' + config.tenantId + '/discovery/v2.0/keys'));
  return async (request: FastifyRequest): Promise<Identity | null> => {
    try {
      let subject: unknown;
      let roles: unknown;
      const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      if (token) {
        const result = await jwtVerify(token, jwks, { issuer, audience: config.audience, algorithms: ['RS256'] });
        subject = result.payload.oid ?? result.payload.sub;
        roles = result.payload.roles;
      } else if (config.platformAuth && typeof request.headers['x-ms-client-principal'] === 'string') {
        // Enabled only in the Azure entrypoint when Easy Auth is explicitly required.
        const encoded = request.headers['x-ms-client-principal'];
        if (encoded.length > 16384) return null;
        const principal = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as { claims?: { typ: string; val: string }[] };
        const claims = principal.claims ?? [];
        const tenant = claims.find(c => c.typ === 'tid' || c.typ.endsWith('/tenantid'))?.val;
        if (tenant !== config.tenantId) return null;
        subject = claims.find(c => c.typ === 'oid' || c.typ.endsWith('/objectidentifier'))?.val;
        roles = claims.filter(c => c.typ === 'roles' || c.typ.endsWith('/role')).map(c => c.val);
      } else return null;
      if (typeof subject !== 'string' || !Array.isArray(roles)) return null;
      if (!roles.includes('Reader') && !roles.includes('Operator')) return null;
      return { id: subject, operator: roles.includes('Operator') };
    } catch { return null; }
  };
}
