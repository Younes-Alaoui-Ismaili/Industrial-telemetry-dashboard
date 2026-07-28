/**
 * Bridge configuration, read from the environment.
 *
 * The command that starts the telemetry MCP server is never written into this
 * repository: it is a path on whoever runs it, so it comes from the environment
 * and the bridge refuses to start without it. That refusal is deliberate. A
 * default guess would silently start a bridge that can never connect, and the
 * dashboard would then report the server as unavailable for a reason that has
 * nothing to do with the server.
 */

/** Port the bridge listens on when PORT is not set. */
export const DEFAULT_PORT = 8787;

/** Browser origins allowed to call the bridge when ALLOWED_ORIGINS is not set. */
export const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export class ConfigError extends Error {}

/**
 * Parse the argument vector for the server command.
 *
 * Accepts a JSON array, which is the form that survives paths containing
 * spaces, and falls back to whitespace splitting for the common simple case.
 *
 * @param {string | undefined} raw
 * @returns {string[]}
 */
export function parseArgs(raw) {
  const value = (raw ?? '').trim();
  if (value === '') return [];

  if (value.startsWith('[')) {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new ConfigError('TELEMETRY_MCP_ARGS looks like JSON but does not parse.');
    }
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      throw new ConfigError('TELEMETRY_MCP_ARGS must be a JSON array of strings.');
    }
    return parsed;
  }

  return value.split(/\s+/);
}

/**
 * Build the bridge configuration from an environment object.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ command: string, args: string[], port: number, origins: string[] }}
 */
export function readConfig(env) {
  const command = (env.TELEMETRY_MCP_COMMAND ?? '').trim();
  if (command === '') {
    throw new ConfigError(
      'TELEMETRY_MCP_COMMAND is required: set it to the executable that starts the telemetry MCP server, ' +
        'for example "node", with TELEMETRY_MCP_ARGS pointing at the server entry point.',
    );
  }

  const port = Number(env.PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`PORT must be an integer between 1 and 65535, got "${env.PORT}".`);
  }

  const rawOrigins = (env.ALLOWED_ORIGINS ?? '').trim();
  const origins =
    rawOrigins === '' ? [...DEFAULT_ORIGINS] : rawOrigins.split(',').map((o) => o.trim()).filter(Boolean);

  return { command, args: parseArgs(env.TELEMETRY_MCP_ARGS), port, origins };
}
