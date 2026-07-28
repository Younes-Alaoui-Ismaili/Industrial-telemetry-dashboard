// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { ConfigError, DEFAULT_ORIGINS, DEFAULT_PORT, parseArgs, readConfig } from '../src/config.js';

describe('parseArgs', () => {
  it('returns nothing for an empty value', () => {
    expect(parseArgs(undefined)).toEqual([]);
    expect(parseArgs('   ')).toEqual([]);
  });

  it('splits a simple command line on whitespace', () => {
    expect(parseArgs('../server/dist/index.js --verbose')).toEqual([
      '../server/dist/index.js',
      '--verbose',
    ]);
  });

  it('accepts a JSON array so paths containing spaces survive', () => {
    expect(parseArgs('["C:/Program Files/app/index.js", "--flag"]')).toEqual([
      'C:/Program Files/app/index.js',
      '--flag',
    ]);
  });

  it('refuses malformed JSON rather than guessing', () => {
    expect(() => parseArgs('["unterminated')).toThrow(ConfigError);
    expect(() => parseArgs('[1, 2]')).toThrow('array of strings');
  });
});

describe('readConfig', () => {
  it('refuses to start without a server command', () => {
    expect(() => readConfig({})).toThrow(ConfigError);
    expect(() => readConfig({ TELEMETRY_MCP_COMMAND: '  ' })).toThrow('TELEMETRY_MCP_COMMAND');
  });

  it('reads the command and arguments from the environment', () => {
    const config = readConfig({
      TELEMETRY_MCP_COMMAND: 'node',
      TELEMETRY_MCP_ARGS: '../server/dist/index.js',
    });
    expect(config).toMatchObject({
      command: 'node',
      args: ['../server/dist/index.js'],
      port: DEFAULT_PORT,
      origins: DEFAULT_ORIGINS,
    });
  });

  it('accepts an explicit port and origin list', () => {
    const config = readConfig({
      TELEMETRY_MCP_COMMAND: 'node',
      PORT: '9000',
      ALLOWED_ORIGINS: 'http://localhost:4173, http://localhost:5173',
    });
    expect(config.port).toBe(9000);
    expect(config.origins).toEqual(['http://localhost:4173', 'http://localhost:5173']);
  });

  it('rejects a port that is not a usable number', () => {
    expect(() => readConfig({ TELEMETRY_MCP_COMMAND: 'node', PORT: 'abc' })).toThrow('PORT');
    expect(() => readConfig({ TELEMETRY_MCP_COMMAND: 'node', PORT: '70000' })).toThrow('PORT');
  });
});
