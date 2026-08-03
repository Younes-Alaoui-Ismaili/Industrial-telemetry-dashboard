/**
 * One shot reachability check on the local bridge.
 *
 * Selecting the live source asks this question first, and the answer decides
 * what the operator sees next: a bridge that answers hands the switch to the
 * live hook, a bridge that does not hands it to the connect guide. The health
 * route costs the bridge a single MCP tool call, where a snapshot costs four.
 *
 * The timeout is hand rolled with AbortController and setTimeout rather than
 * AbortSignal.timeout, because jsdom schedules the latter outside the fake
 * timers the tests drive. The helper never throws; it answers.
 */

import { BRIDGE_URL } from '../constants/mcp';

/** How long the bridge gets to answer before the connect guide opens. */
export const PROBE_TIMEOUT_MS = 3500;

export async function probeBridge(timeoutMs: number = PROBE_TIMEOUT_MS): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BRIDGE_URL}/api/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
