/**
 * Live source settings.
 *
 * The bridge runs on the same machine as the browser, so its address is a
 * localhost default that can be overridden at build time. No machine specific
 * path ever reaches this repository: the path to the telemetry server itself is
 * the bridge's business, and the bridge reads it from its own environment.
 */

/** Where the local bridge listens. Override with VITE_BRIDGE_URL. */
export const BRIDGE_URL: string =
  (import.meta.env?.VITE_BRIDGE_URL as string | undefined) ?? 'http://localhost:8787';

/**
 * How often the dashboard asks the bridge for a snapshot.
 *
 * Slower than the simulator's two second tick on purpose: every poll is four
 * real tool calls against a real server, and the server samples on a thirty
 * second step, so polling faster would only re-fetch the same points.
 */
export const MCP_POLL_MS = 5000;

/** Telemetry window requested from the server, in milliseconds. */
export const MCP_WINDOW_MS = 900_000;

/** Sampling step requested from the server, in milliseconds. */
export const MCP_STEP_MS = 30_000;
