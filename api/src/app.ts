import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { authenticator, type AuthConfig, type Identity } from './auth.js';
import { DomainError, type TelemetryStore, type Device, type Measurement } from './types.js';
import { responseContracts } from './contracts.js';

const idSchema = { type: 'string', minLength: 1, maxLength: 80, pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]*$' };
const timestamp = { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const rangeSchema = { type: 'object', additionalProperties: false, properties: { device_id: idSchema, start: timestamp, end: timestamp } };
const eventSchema = {
  type: 'object', additionalProperties: false,
  required: ['event_id', 'device_id', 'timestamp', 'temperature_c', 'vibration_mm_s', 'state', 'provenance'],
  properties: {
    event_id: { type: 'string', minLength: 1, maxLength: 128, pattern: '^[a-zA-Z0-9_-]+$' },
    device_id: idSchema, timestamp,
    temperature_c: { type: 'number', minimum: -100, maximum: 500 },
    vibration_mm_s: { type: 'number', minimum: 0, maximum: 1000 },
    state: { type: 'string', enum: ['running', 'idle', 'fault'] },
    provenance: { type: 'string', const: 'simulated' },
  },
};
export async function buildApp(options: { store: TelemetryStore; auth: AuthConfig; logger?: boolean; publicDir?: string; deployment?: 'local' | 'azure' }) {
  const authenticate = authenticator(options.auth);
  const identities = new WeakMap<object, Identity>();
  const app = Fastify({ bodyLimit: 512 * 1024, logger: options.logger === false ? false : { redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'] }, ajv: { customOptions: { removeAdditional: false } } });
  await app.register(swagger, { openapi: { info: { title: 'Telemetry proof API', version: '1.0.0' }, components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } } } });
  app.addHook('onRoute', route => {
    const response = responseContracts[String(route.method) + ' ' + route.url];
    if (response) route.schema = { ...route.schema, response: { 200: response } };
  });
  const publicPaths = new Set(['/healthz', '/api/v1/openapi.json']);
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0];
    if (!path.startsWith('/api/') || publicPaths.has(path)) return;
    const identity = await authenticate(request);
    if (!identity) return reply.code(401).header('WWW-Authenticate', 'Bearer').send({ error: 'unauthorized' });
    identities.set(request, identity);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (!identity.operator) return reply.code(403).send({ error: 'forbidden' });
      const origin = request.headers.origin;
      if (origin) {
        let accepted = false;
        try { accepted = ['http:', 'https:'].includes(new URL(origin).protocol) && new URL(origin).host === request.headers.host; } catch { accepted = false; }
        if (!accepted) return reply.code(403).send({ error: 'origin_rejected' });
      }
    }
    reply.header('Cache-Control', 'no-store');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error && typeof error === 'object' && 'validation' in error) return reply.code(400).send({ error: 'invalid_request' });
    if (error instanceof DomainError) return reply.code(error.statusCode).send({ error: error.code });
    request.log.warn({ code: 'source_unavailable', requestId: request.id }, 'Request failed');
    return reply.code(503).send({ error: 'source_unavailable', request_id: request.id });
  });
  const security = [{ bearer: [] }];
  app.get('/healthz', async () => ({ status: 'ready' }));
  app.get('/api/v1/openapi.json', async () => app.swagger());
  app.get('/api/v1/health', { schema: { security } }, async request => {
    await options.store.health();
    const identity = identities.get(request)!;
    return { status: 'ready', deployment: options.deployment ?? 'local', provenance: 'simulated', role: identity.operator ? 'Operator' : 'Reader' };
  });
  app.get('/api/v1/devices', { schema: { security } }, async () => ({ devices: await options.store.devices() }));
  app.post<{ Body: Device }>('/api/v1/devices', { schema: { security, body: {
    type: 'object', additionalProperties: false, required: ['id', 'name', 'temperature_limit', 'vibration_limit'],
    properties: { id: idSchema, name: { type: 'string', minLength: 1, maxLength: 120 }, temperature_limit: { type: 'number', minimum: -100, maximum: 500 }, vibration_limit: { type: 'number', minimum: 0, maximum: 1000 } },
  } } }, async request => options.store.registerDevice(request.body, identities.get(request)!.id));
  app.post<{ Body: { events: Measurement[] } }>('/api/v1/telemetry', { schema: { security, body: { type: 'object', additionalProperties: false, required: ['events'], properties: { events: { type: 'array', minItems: 1, maxItems: 500, items: eventSchema } } } } },
    async request => options.store.ingest(request.body.events, identities.get(request)!.id));
  function range(query: { start?: number; end?: number }) {
    const end = query.end ?? Date.now();
    const start = query.start ?? Math.max(0, end - 900000);
    if (start > end || end - start > 86400000) throw new DomainError(400, 'invalid_time_range');
    return { start, end };
  }
  type Query = { device_id?: string; start?: number; end?: number };
  app.get<{ Querystring: Query }>('/api/v1/telemetry', { schema: { security, querystring: { ...rangeSchema, required: ['device_id'] } } }, async request => {
    const { start, end } = range(request.query);
    const readings = await options.store.telemetry(request.query.device_id!, start, end);
    return { device_id: request.query.device_id, start, end, provenance: 'simulated', readings };
  });
  app.get<{ Querystring: Query }>('/api/v1/anomalies', { schema: { security, querystring: rangeSchema } }, async request => {
    const { start, end } = range(request.query);
    return { window: { start, end }, anomalies: await options.store.anomalies(request.query.device_id, start, end) };
  });
  app.get<{ Querystring: Query }>('/api/v1/alarms', { schema: { security, querystring: { type: 'object', additionalProperties: false, properties: { device_id: idSchema } } } }, async request => ({ alarms: await options.store.alarms(request.query.device_id) }));
  app.post<{ Params: { id: string } }>('/api/v1/alarms/:id/acknowledgements', { schema: { security, params: { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1, maxLength: 80 } } }, body: { type: 'object', additionalProperties: false } } }, async request => options.store.acknowledge(request.params.id, identities.get(request)!.id));
  app.get<{ Querystring: Query }>('/api/v1/report', { schema: { security, querystring: rangeSchema } }, async request => {
    const { start, end } = range(request.query);
    return { window: { start, end }, ...(await options.store.report(start, end) as object) };
  });
  const publicDir = options.publicDir ?? resolve('public');
  if (existsSync(publicDir)) await app.register(staticFiles, { root: publicDir });
  await app.ready();
  return app;
}
