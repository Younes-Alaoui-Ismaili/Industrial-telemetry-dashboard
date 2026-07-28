// @vitest-environment node
/**
 * Session behaviour against a fake child process. Nothing is spawned, nothing
 * listens, and the only bytes that move are the ones the SDK writes into an in
 * memory pipe.
 */

import { describe, it, expect } from 'vitest';
import { createSession, unwrapToolResult, McpToolError } from '../src/session.js';
import { fakeChildTransport, startFakeSession, FAKE_DEVICES } from './fakeServer.js';

describe('createSession', () => {
  it('connects lazily and returns the parsed payload of a tool call', async () => {
    const { child } = await startFakeSession();
    const session = createSession({
      command: 'irrelevant',
      createTransport: () => fakeChildTransport(child),
    });

    expect(session.state().status).toBe('idle');

    const payload = await session.call('list_devices', { response_format: 'json' });

    expect(payload.devices).toHaveLength(FAKE_DEVICES.length);
    expect(payload.devices[0].id).toBe('press-01');
    expect(session.state().status).toBe('connected');
    expect(session.state().server?.name).toBe('fake-telemetry');

    await session.close();
  });

  it('reuses one connection across calls instead of spawning per request', async () => {
    const { child } = await startFakeSession();
    let transports = 0;
    const session = createSession({
      command: 'irrelevant',
      createTransport: () => {
        transports += 1;
        return fakeChildTransport(child);
      },
    });

    await Promise.all([session.call('list_devices'), session.call('list_devices')]);
    await session.call('list_devices');

    expect(transports).toBe(1);
    await session.close();
  });

  it('reports the server as unavailable when the command cannot start', async () => {
    const session = createSession({
      command: 'missing',
      createTransport: () => ({
        start: () => Promise.reject(new Error('spawn missing ENOENT')),
        send: () => Promise.resolve(),
        close: () => Promise.resolve(),
      }),
    });

    await expect(session.call('list_devices')).rejects.toThrow('spawn missing ENOENT');

    const state = session.state();
    expect(state.status).toBe('unavailable');
    expect(state.detail).toContain('ENOENT');
  });

  it('surfaces a tool error instead of returning a plausible looking payload', async () => {
    const { child } = await startFakeSession({ failing: 'get_telemetry' });
    const session = createSession({
      command: 'irrelevant',
      createTransport: () => fakeChildTransport(child),
    });

    await expect(session.call('get_telemetry', { device_id: 'press-01' })).rejects.toBeInstanceOf(
      McpToolError,
    );
    await expect(session.call('get_telemetry', { device_id: 'press-01' })).rejects.toThrow(
      'device is not reachable',
    );

    await session.close();
  });

  it('goes unavailable when the child process dies mid session', async () => {
    const { child } = await startFakeSession();
    const session = createSession({
      command: 'irrelevant',
      createTransport: () => fakeChildTransport(child),
    });

    await session.call('list_devices');
    expect(session.state().status).toBe('connected');

    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(session.state().status).toBe('unavailable');
    expect(session.state().detail).toContain('closed');
  });

  it('reconnects on the next call once the server is back', async () => {
    const first = await startFakeSession();
    const second = await startFakeSession();
    const children = [first.child, second.child];
    let index = 0;

    const session = createSession({
      command: 'irrelevant',
      createTransport: () => fakeChildTransport(children[index++]),
    });

    await session.call('list_devices');
    first.child.kill();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(session.state().status).toBe('unavailable');

    const payload = await session.call('list_devices');
    expect(payload.devices).toHaveLength(FAKE_DEVICES.length);
    expect(session.state().status).toBe('connected');
    expect(index).toBe(2);

    await session.close();
  });
});

describe('unwrapToolResult', () => {
  it('prefers structured content', () => {
    const payload = unwrapToolResult('list_devices', {
      content: [{ type: 'text', text: '{"devices":[]}' }],
      structuredContent: { count: 3 },
    });
    expect(payload).toEqual({ count: 3 });
  });

  it('falls back to parsing the text block', () => {
    expect(unwrapToolResult('x', { content: [{ type: 'text', text: '{"a":1}' }] })).toEqual({ a: 1 });
  });

  it('throws on an error result rather than returning it as data', () => {
    expect(() =>
      unwrapToolResult('simulate_fault', {
        content: [{ type: 'text', text: 'unknown device' }],
        isError: true,
      }),
    ).toThrow('unknown device');
  });

  it('throws when the text block is not JSON', () => {
    expect(() => unwrapToolResult('x', { content: [{ type: 'text', text: 'not json' }] })).toThrow(
      'not JSON',
    );
  });

  it('throws on an empty result', () => {
    expect(() => unwrapToolResult('x', { content: [] })).toThrow('empty');
  });
});
