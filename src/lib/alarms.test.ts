import { describe, it, expect } from 'vitest';
import {
  acknowledge,
  alarmDuration,
  alarmState,
  countBySeverity,
  formatDuration,
  isOpen,
  reconcileAlarms,
} from './alarms';
import type { Alarm, Asset, AssetSpec } from '../types';

const spec: AssetSpec = {
  id: 'PRESS-01',
  name: 'Hydraulic Press',
  kind: 'press',
  metrics: [
    {
      key: 'temperature',
      label: 'Temp',
      unit: 'C',
      decimals: 1,
      nominal: 62,
      jitter: 0.8,
      warn: 72,
      alarm: 77,
    },
  ],
};

const asset = (temperature: number): Asset => ({
  spec,
  state: 'running',
  values: { temperature },
  lastSeen: 1000,
});

const T0 = 1_700_000_000_000;

describe('reconcileAlarms', () => {
  it('raises nothing while readings stay inside their limits', () => {
    expect(reconcileAlarms([], [asset(62)], T0)).toEqual([]);
  });

  it('raises a warning when the warning limit is exceeded', () => {
    const alarms = reconcileAlarms([], [asset(73)], T0);
    expect(alarms).toHaveLength(1);
    expect(alarms[0]).toMatchObject({
      assetId: 'PRESS-01',
      metric: 'temperature',
      severity: 'warning',
      threshold: 72,
      peakValue: 73,
      raisedAt: T0,
    });
    expect(alarms[0].clearedAt).toBeUndefined();
  });

  it('raises an alarm, with the alarm limit recorded, above the alarm limit', () => {
    const alarms = reconcileAlarms([], [asset(88)], T0);
    expect(alarms[0]).toMatchObject({ severity: 'alarm', threshold: 77 });
  });

  it('does not duplicate an alarm that is already open', () => {
    let alarms = reconcileAlarms([], [asset(80)], T0);
    alarms = reconcileAlarms(alarms, [asset(82)], T0 + 2000);
    alarms = reconcileAlarms(alarms, [asset(81)], T0 + 4000);
    expect(alarms).toHaveLength(1);
  });

  it('tracks the peak value while the alarm stays open', () => {
    let alarms = reconcileAlarms([], [asset(80)], T0);
    alarms = reconcileAlarms(alarms, [asset(91.4)], T0 + 2000);
    alarms = reconcileAlarms(alarms, [asset(84)], T0 + 4000);
    expect(alarms[0].peakValue).toBe(91.4);
  });

  it('escalates an open warning to an alarm without opening a second one', () => {
    let alarms = reconcileAlarms([], [asset(73)], T0);
    expect(alarms[0].severity).toBe('warning');
    alarms = reconcileAlarms(alarms, [asset(90)], T0 + 2000);
    expect(alarms).toHaveLength(1);
    expect(alarms[0]).toMatchObject({ severity: 'alarm', threshold: 77 });
  });

  it('clears an alarm when the reading returns inside its limits', () => {
    let alarms = reconcileAlarms([], [asset(80)], T0);
    alarms = reconcileAlarms(alarms, [asset(62)], T0 + 6000);
    expect(alarms).toHaveLength(1);
    expect(alarms[0].clearedAt).toBe(T0 + 6000);
  });

  it('raises a fresh alarm if the reading leaves its limits again after clearing', () => {
    let alarms = reconcileAlarms([], [asset(80)], T0);
    alarms = reconcileAlarms(alarms, [asset(62)], T0 + 2000);
    alarms = reconcileAlarms(alarms, [asset(85)], T0 + 4000);
    expect(alarms).toHaveLength(2);
    expect(alarms.filter((a) => a.clearedAt === undefined)).toHaveLength(1);
  });

  it('ignores metrics that have no reading', () => {
    const bare: Asset = { spec, state: 'running', values: {}, lastSeen: 0 };
    expect(reconcileAlarms([], [bare], T0)).toEqual([]);
  });
});

describe('alarm lifecycle states', () => {
  const open = (): Alarm => reconcileAlarms([], [asset(80)], T0)[0];

  it('starts unacknowledged', () => {
    expect(alarmState(open())).toBe('unacknowledged');
  });

  it('becomes acknowledged while still active', () => {
    const acked = acknowledge([open()], open().id, T0 + 1000)[0];
    expect(alarmState(acked)).toBe('acknowledged');
  });

  it('keeps a distinct state when it returns to normal before being acknowledged', () => {
    let alarms = reconcileAlarms([], [asset(80)], T0);
    alarms = reconcileAlarms(alarms, [asset(62)], T0 + 3000);
    expect(alarmState(alarms[0])).toBe('returned-unacknowledged');
    expect(isOpen(alarms[0])).toBe(true);
  });

  it('is only fully cleared once it both returned to normal and was acknowledged', () => {
    let alarms = reconcileAlarms([], [asset(80)], T0);
    alarms = reconcileAlarms(alarms, [asset(62)], T0 + 3000);
    alarms = acknowledge(alarms, alarms[0].id, T0 + 4000);
    expect(alarmState(alarms[0])).toBe('cleared');
    expect(isOpen(alarms[0])).toBe(false);
  });
});

describe('acknowledge', () => {
  it('never removes an alarm, it only stamps it', () => {
    const alarms = reconcileAlarms([], [asset(80)], T0);
    const after = acknowledge(alarms, alarms[0].id, T0 + 1000);
    expect(after).toHaveLength(1);
    expect(after[0].acknowledgedAt).toBe(T0 + 1000);
  });

  it('does not re-stamp an already acknowledged alarm', () => {
    const alarms = acknowledge(reconcileAlarms([], [asset(80)], T0), `PRESS-01:temperature:${T0}`, T0 + 1000);
    const again = acknowledge(alarms, alarms[0].id, T0 + 9000);
    expect(again[0].acknowledgedAt).toBe(T0 + 1000);
  });

  it('leaves other alarms untouched', () => {
    const alarms = reconcileAlarms([], [asset(80)], T0);
    expect(acknowledge(alarms, 'does-not-exist', T0 + 1000)[0].acknowledgedAt).toBeUndefined();
  });
});

describe('duration', () => {
  it('runs to now while open and freezes at the clearing time', () => {
    let alarms = reconcileAlarms([], [asset(80)], T0);
    expect(alarmDuration(alarms[0], T0 + 5000)).toBe(5000);
    alarms = reconcileAlarms(alarms, [asset(62)], T0 + 8000);
    expect(alarmDuration(alarms[0], T0 + 60000)).toBe(8000);
  });

  it('formats as minutes and seconds, and adds hours only when needed', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9000)).toBe('0:09');
    expect(formatDuration(252000)).toBe('4:12');
    expect(formatDuration(3723000)).toBe('1:02:03');
  });
});

describe('countBySeverity', () => {
  it('counts only alarms that are still active', () => {
    let alarms = reconcileAlarms([], [asset(80)], T0);
    expect(countBySeverity(alarms)).toEqual({ warning: 0, alarm: 1 });
    alarms = reconcileAlarms(alarms, [asset(62)], T0 + 2000);
    expect(countBySeverity(alarms)).toEqual({ warning: 0, alarm: 0 });
  });
});
