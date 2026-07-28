#!/usr/bin/env node
/**
 * Bridge entry point.
 *
 * Reads the server command from the environment, opens the listener, and leaves
 * the MCP connection to be made on the first request. Connecting lazily means
 * the bridge starts and reports honestly even when the telemetry server is not
 * installed yet, instead of dying at boot and leaving the dashboard with nothing
 * to talk to.
 */

import { ConfigError, readConfig } from './config.js';
import { createSession } from './session.js';
import { createServer } from './server.js';

function main() {
  let config;
  try {
    config = readConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`configuration error: ${error.message}`);
      process.exit(2);
    }
    throw error;
  }

  const session = createSession({ command: config.command, args: config.args });
  const server = createServer({ session, origins: config.origins });

  server.listen(config.port, '127.0.0.1', () => {
    console.log(`bridge listening on http://127.0.0.1:${config.port}`);
    console.log(`telemetry server command: ${[config.command, ...config.args].join(' ')}`);
    console.log(`allowed origins: ${config.origins.join(', ')}`);
  });

  const shutdown = () => {
    server.close();
    void session.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
