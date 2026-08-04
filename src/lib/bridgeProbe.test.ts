import { describe, it, expect, afterEach, vi } from 'vitest';
import { probeBridge, PROBE_TIMEOUT_MS } from './bridgeProbe';
import { BRIDGE_URL } from '../constants/mcp';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('probeBridge', () => {
  it('reports reachable on a 2xx answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));
    await expect(probeBridge()).resolves.toBe(true);
  });

  it('reports not reachable on a non-2xx answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(probeBridge()).resolves.toBe(false);
  });

  it('reports not reachable when the fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(probeBridge()).resolves.toBe(false);
  });

  it('gives up after the timeout', async () => {
    vi.useFakeTimers();
    // A fetch that answers only when its signal aborts, the way a hung
    // connection does once the controller gives up on it.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, opts: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            opts.signal.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError')),
            );
          }),
      ),
    );

    const pending = probeBridge();
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS);
    await expect(pending).resolves.toBe(false);
  });

  it('asks the bridge for its health', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    await probeBridge();
    expect(fetchMock).toHaveBeenCalledWith(
      `${BRIDGE_URL}/api/health`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
