/**
 * MCP client session.
 *
 * Owns one connection to the telemetry MCP server and hands back parsed tool
 * results. Framing, initialisation and request correlation are the official
 * SDK's job, not this file's: a hand written JSON-RPC layer is exactly where the
 * bugs that break a live demo live.
 *
 * The session is lazy and self healing. It connects on the first call, and if
 * the child process dies or the connection closes it drops the client so the
 * next call attempts a fresh connect. Nothing here retries in a loop or hides a
 * failure: a call against a server that is not there rejects, and the caller is
 * expected to say so out loud.
 *
 * `createTransport` is injected so the session can be driven by a fake child
 * process in tests. Production passes the default, which spawns the real one.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export const CLIENT_NAME = 'telemetry-mcp-bridge';
export const CLIENT_VERSION = '0.1.0';

/** Thrown when the server answers a tool call with an error result. */
export class McpToolError extends Error {
  constructor(tool, message) {
    super(`Tool "${tool}" failed: ${message}`);
    this.name = 'McpToolError';
    this.tool = tool;
  }
}

/**
 * Default transport: spawn the server as a child process and speak stdio to it.
 * The child's stderr is inherited so its own logs stay visible in the terminal.
 */
export function createStdioTransport({ command, args }) {
  return new StdioClientTransport({ command, args, stderr: 'inherit' });
}

/**
 * Pull the payload out of a tool result.
 *
 * Prefers `structuredContent`, which the telemetry tools declare an output
 * schema for, and falls back to parsing the text block for a server that only
 * returns text.
 */
export function unwrapToolResult(tool, result) {
  const textOf = () =>
    (result?.content ?? [])
      .filter((part) => part?.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim();

  if (result?.isError) throw new McpToolError(tool, textOf() || 'no detail returned');
  if (result?.structuredContent !== undefined) return result.structuredContent;

  const text = textOf();
  if (text === '') throw new McpToolError(tool, 'returned an empty result');
  try {
    return JSON.parse(text);
  } catch {
    throw new McpToolError(tool, 'returned text that is not JSON');
  }
}

export function createSession({ command, args = [], createTransport = createStdioTransport }) {
  /** @type {Client | null} */
  let client = null;
  /** @type {Promise<Client> | null} */
  let pending = null;
  let status = 'idle';
  let detail;
  let server;

  function fail(error) {
    status = 'unavailable';
    detail = error instanceof Error ? error.message : String(error);
    server = undefined;
  }

  function drop(instance) {
    if (client === instance) client = null;
  }

  async function connect() {
    status = 'connecting';
    detail = undefined;
    const instance = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION });

    instance.onclose = () => {
      drop(instance);
      if (status === 'connected') {
        status = 'unavailable';
        detail = 'The MCP server connection closed.';
        server = undefined;
      }
    };

    try {
      await instance.connect(createTransport({ command, args }));
    } catch (error) {
      fail(error);
      throw error;
    }

    client = instance;
    status = 'connected';
    detail = undefined;
    server = instance.getServerVersion();
    return instance;
  }

  function ensure() {
    if (client) return Promise.resolve(client);
    if (!pending) {
      pending = connect().finally(() => {
        pending = null;
      });
    }
    return pending;
  }

  return {
    /** Call one tool and return its parsed payload. Rejects if the server is down. */
    async call(tool, args = {}) {
      const instance = await ensure();
      let result;
      try {
        result = await instance.callTool({ name: tool, arguments: args });
      } catch (error) {
        drop(instance);
        fail(error);
        throw error;
      }
      return unwrapToolResult(tool, result);
    },

    /** Current connection state, reported to the dashboard as is. */
    state() {
      return { status, detail, server };
    },

    async close() {
      const instance = client;
      client = null;
      status = 'idle';
      detail = undefined;
      server = undefined;
      if (instance) {
        instance.onclose = undefined;
        await instance.close();
      }
    },
  };
}
