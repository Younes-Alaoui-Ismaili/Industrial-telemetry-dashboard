import test from 'node:test';
import assert from 'node:assert/strict';
import { connectWithRetry } from '../src/connect-retry.js';

test('SQL startup recovers from transient connection failures and closes failed pools', async () => {
  let attempts = 0; let closed = 0; const delays: number[] = [];
  const pool = await connectWithRetry(() => {
    const attempt = ++attempts;
    return { connect: async () => { if (attempt < 3) throw { code: 'ETIMEOUT' }; }, close: async () => { closed++; }, attempt };
  }, async ms => { delays.push(ms); });
  assert.equal(pool.attempt, 3); assert.equal(closed, 2); assert.deepEqual(delays, [5000, 10000]);
});
test('SQL startup is bounded and does not retry permanent authentication errors', async () => {
  for (const [error, expected] of [[{ code: 'ELOGIN' }, 1], [{ code: 'ETIMEOUT' }, 4], [{ originalError: { info: { number: 40613 } } }, 4]] as const) {
    let attempts = 0; let closed = 0;
    await assert.rejects(connectWithRetry(() => ({ connect: async () => { attempts++; throw error; }, close: async () => { closed++; } }), async () => {}));
    assert.equal(attempts, expected); assert.equal(closed, expected);
  }
});
