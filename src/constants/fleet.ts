/**
 * The simulated fleet.
 *
 * The first four assets mirror the machines exposed by the companion telemetry
 * server, including their operating limits, so both projects describe the same
 * plant. `sourceId` records that correspondence.
 *
 * Metrics are deliberately asymmetric between machine kinds: a press reports
 * pressure and a cycle count, a spindle reports speed. Uniform rows would look
 * tidy and read as fake.
 *
 * Nominal plus jitter always stays well inside the warning limit, so a healthy
 * machine never trips an alarm on noise alone.
 */

import type { AssetSpec } from '../types';

const temperature = (nominal: number, warn: number, alarm: number) => ({
  key: 'temperature' as const,
  label: 'Temp',
  unit: 'C',
  decimals: 1,
  nominal,
  jitter: 0.8,
  warn,
  alarm,
});

const vibration = (nominal: number, warn: number, alarm: number) => ({
  key: 'vibration' as const,
  label: 'Vibration',
  unit: 'mm/s',
  decimals: 2,
  nominal,
  jitter: 0.12,
  warn,
  alarm,
});

const pressure = (nominal: number, warn: number, alarm: number, decimals = 1) => ({
  key: 'pressure' as const,
  label: 'Pressure',
  unit: 'bar',
  decimals,
  nominal,
  jitter: decimals === 0 ? 3 : 0.15,
  warn,
  alarm,
});

const speed = (nominal: number, warn: number, alarm: number) => ({
  key: 'speed' as const,
  label: 'Speed',
  unit: 'rpm',
  decimals: 0,
  nominal,
  jitter: nominal > 1000 ? 60 : 1.2,
  warn,
  alarm,
});

const cycles = (nominal: number) => ({
  key: 'cycles' as const,
  label: 'Cycles',
  unit: '',
  decimals: 0,
  nominal,
  jitter: 2,
  counter: true,
});

export const FLEET: readonly AssetSpec[] = [
  {
    id: 'PRESS-01',
    name: 'Hydraulic Press',
    kind: 'press',
    sourceId: 'press-01',
    metrics: [
      temperature(62, 72, 77),
      vibration(2.1, 3.4, 4.1),
      pressure(210, 240, 255, 0),
      cycles(48210),
    ],
  },
  {
    id: 'SPINDLE-02',
    name: 'CNC Spindle',
    kind: 'spindle',
    sourceId: 'spindle-02',
    metrics: [temperature(48, 58, 63), vibration(1.4, 2.7, 3.4), speed(12000, 14500, 15200)],
  },
  {
    id: 'CONVEYOR-03',
    name: 'Conveyor Motor',
    kind: 'conveyor',
    sourceId: 'conveyor-03',
    metrics: [temperature(40, 50, 55), vibration(0.9, 2.2, 2.9), speed(45, 58, 62)],
  },
  {
    id: 'PUMP-04',
    name: 'Coolant Pump',
    kind: 'pump',
    sourceId: 'pump-04',
    metrics: [temperature(55, 65, 70), vibration(1.7, 3.0, 3.7), pressure(6.4, 8.2, 9.0)],
  },
  {
    id: 'PRESS-05',
    name: 'Hydraulic Press',
    kind: 'press',
    metrics: [temperature(59, 72, 77), pressure(205, 240, 255, 0), cycles(31877)],
  },
  {
    id: 'SPINDLE-06',
    name: 'CNC Spindle',
    kind: 'spindle',
    metrics: [temperature(46, 58, 63), vibration(1.5, 2.7, 3.4), speed(11200, 14500, 15200)],
  },
  {
    id: 'COMPRESSOR-07',
    name: 'Air Compressor',
    kind: 'compressor',
    metrics: [temperature(68, 80, 86), vibration(1.9, 3.1, 3.8), pressure(8.2, 9.6, 10.2)],
  },
  {
    id: 'CHILLER-08',
    name: 'Process Chiller',
    kind: 'chiller',
    metrics: [temperature(12, 19, 23), pressure(4.1, 5.4, 5.9)],
  },
] as const;

/** Simulation tick in milliseconds. */
export const TICK_MS = 2000;

/** Samples retained per metric for the trend and sparklines. */
export const HISTORY_LENGTH = 60;

/** How long an injected fault keeps pushing a metric past its alarm limit. */
export const FAULT_DURATION_MS = 30000;
