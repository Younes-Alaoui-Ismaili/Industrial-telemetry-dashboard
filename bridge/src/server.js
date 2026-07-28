/**
 * Node HTTP shell around `api.handle`.
 *
 * Binds to the loopback interface only. The bridge starts a child process and
 * relays its tool calls, so it is a local development aid and has no business
 * being reachable from the network.
 */

import { createServer as createHttpServer } from 'node:http';
import { handle } from './api.js';

const MAX_BODY_BYTES = 64 * 1024;

/**
 * @param {{ session: object, origins: string[] }} options
 */
export function createServer({ session, origins }) {
  return createHttpServer((req, res) => {
    void respond(req, res, { session, origins });
  });
}

async function respond(req, res, { session, origins }) {
  const origin = req.headers.origin;
  if (origin && origins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');

  let body;
  if (req.method === 'POST') {
    try {
      body = await readJson(req);
    } catch (error) {
      send(res, 400, { status: 'error', detail: error.message });
      return;
    }
  }

  const { status, body: payload } = await handle(
    { method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, body },
    { session },
  );
  send(res, status, payload);
}

function send(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (text === '') {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new Error('Request body is not valid JSON.'));
      }
    });
  });
}
