import { describe, it, expect } from 'vitest';
import {
  assetIdFor,
  deviceIdFor,
  faultTypeFor,
  specForDevice,
  toAlarms,
  toAssets,
  toHistory,
} from './mcpMapping';
import { alarmState } from './alarms';
import type { WireAnomaly, WireDevice, WireReading } from '../types/mcp';

const press: WireDevice = {
  id: 'press-01',
  name: 'Hydraulic Press',
  state: 'running',
  temperature_c: 62.4,
  vibration_mm_s: 2.05,
  timestamp: 1_700_000_000_000,
};

const unknown: WireDevice = {
  id: 'kiln-99',
  name: 'Tunnel Kiln',
  state: 'idle',
  temperature_c: 210,
  vibration_mm_s: 0.4,
  timestamp: 1_700_000_000_000,
};

describe('specForDevice', () => {
  it('uses the dashboard definition when both projects describe the same machine', () => {
    const spec = specForDevice(press);
    expect(spec.id).toBe('PRESS-01');
    expect(spec.name).toBe('Hydraulic Press');
  });

  it('shows only the metrics the server actually reports', () => {
    // The simulated twin also carries pressure and a cycle counter. The server
    // reports neither, so neither is shown rather than being carried over stale.
    expect(specForDevice(press).metrics.map((m) => m.key)).toEqual(['temperature', 'vibration']);
  });

  it('keeps the operating limits of the known machine', () => {
    const temperature = specForDevice(press).metrics[0];
    expect(temperature.warn).toBe(72);
    expect(temperature.alarm).toBe(77);
  });

  it('shows an unknown machine with no limits rather than invented ones', () => {
    const spec = specForDevice(unknown);
    expect(spec.id).toBe('kiln-99');
    expect(spec.metrics.every((m) => m.warn === undefined && m.alarm === undefined)).toBe(true);
  });
});

describe('id translation', () => {
  it('maps a server device id to the dashboard asset id and back', () => {
    expect(assetIdFor('spindle-02')).toBe('SPINDLE-02');
    expect(deviceIdFor('SPINDLE-02')).toBe('spindle-02');
  });

  it('passes an unknown id through unchanged', () => {
    expect(assetIdFor('kiln-99')).toBe('kiln-99');
    expect(deviceIdFor('kiln-99')).toBe('kiln-99');
  });

  it('picks the fault type the server understands for a metric', () => {
    expect(faultTypeFor('vibration')).toBe('vibration');
    expect(faultTypeFor('temperature')).toBe('overheat');
    expect(faultTypeFor()).toBe('overheat');
  });
});

describe('toAssets', () => {
  it('carries the server reading and state through untouched', () => {
    const [asset] = toAssets([press]);
    expect(asset.state).toBe('running');
    expect(asset.values.temperature).toBe(62.4);
    expect(asset.values.vibration).toBe(2.05);
    expect(asset.lastSeen).toBe(press.timestamp);
  });

  it('leaves metrics the server does not report undefined', () => {
    const [asset] = toAssets([press]);
    expect(asset.values.pressure).toBeUndefined();
    expect(asset.values.cycles).toBeUndefined();
  });
});

describe('toHistory', () => {
  const readings: WireReading[] = [
    { timestamp: 10, temperature_c: 61, vibration_mm_s: 2.0, state: 'running' },
    { timestamp: 20, temperature_c: 63, vibration_mm_s: 2.1, state: 'running' },
  ];

  it('keys history the way the charts read it', () => {
    const history = toHistory({ 'press-01': readings });
    expect(Object.keys(history).sort()).toEqual(['PRESS-01:temperature', 'PRESS-01:vibration']);
  });

  it('keeps the server timestamps and values', () => {
    const history = toHistory({ 'press-01': readings });
    expect(history['PRESS-01:temperature']).toEqual([
      { timestamp: 10, value: 61 },
      { timestamp: 20, value: 63 },
    ]);
    expect(history['PRESS-01:vibration'][1]).toEqual({ timestamp: 20, value: 2.1 });
  });
});

describe('toAlarms', () => {
  const now = 1_700_000_000_000;
  const anomaly: WireAnomaly = {
    id: 'spindle-02:temperature:1699999880000',
    device_id: 'spindle-02',
    metric: 'temperature',
    started_at: now - 120_000,
    ended_at: now + 60_000,
    peak_value: 76.1,
    threshold: 63,
    sample_count: 4,
  };

  it('raises the alarm the server detected, with the threshold the server crossed', () => {
    const [alarm] = toAlarms([anomaly], [], now);
    expect(alarm).toMatchObject({
      assetId: 'SPINDLE-02',
      metric: 'temperature',
      severity: 'alarm',
      threshold: 63,
      peakValue: 76.1,
      raisedAt: anomaly.started_at,
    });
    expect(alarm.unit).toBe('C');
  });

  it('leaves an excursion that is still running uncleared', () => {
    expect(alarmState(toAlarms([anomaly], [], now)[0])).toBe('unacknowledged');
  });

  it('clears an excursion whose window already ended', () => {
    const past = { ...anomaly, ended_at: now - 1000 };
    expect(alarmState(toAlarms([past], [], now)[0])).toBe('returned-unacknowledged');
  });

  /**
   * The server re-derives its anomaly list on every query, so the id it returns
   * for one continuous fault changes between polls. Keying alarms on that id
   * would add a row per poll, which is exactly the failure this pins.
   */
  it('keeps one alarm across polls even when the server changes the anomaly id', () => {
    let alarms = toAlarms([anomaly], [], now);
    const raised = alarms[0];

    for (let poll = 1; poll <= 4; poll += 1) {
      alarms = toAlarms(
        [
          {
            ...anomaly,
            id: `spindle-02:temperature:${now + poll * 5000}`,
            started_at: anomaly.started_at + poll * 5000,
            ended_at: now + poll * 5000 + 60_000,
            peak_value: 76.1 + poll * 0.1,
          },
        ],
        alarms,
        now + poll * 5000,
      );
    }

    expect(alarms).toHaveLength(1);
    expect(alarms[0].id).toBe(raised.id);
    expect(alarms[0].raisedAt).toBe(anomaly.started_at);
    expect(alarms[0].peakValue).toBeCloseTo(76.5, 5);
  });

  /**
   * The failure this pins was seen in the browser before it was fixed: an
   * excursion that had already ended stayed inside the queried window, so every
   * poll re-raised it and the panel filled with copies of one fault.
   */
  it('does not re-raise an excursion that already ended and is still in the window', () => {
    const ended = { ...anomaly, ended_at: now - 60_000, started_at: now - 180_000 };
    let alarms = toAlarms([ended], [], now);
    expect(alarms).toHaveLength(1);
    const first = alarms[0];

    for (let poll = 1; poll <= 5; poll += 1) {
      alarms = toAlarms(
        [
          {
            ...ended,
            id: `spindle-02:temperature:${now + poll}`,
            started_at: ended.started_at + poll * 4000,
            ended_at: ended.ended_at + poll * 3000,
          },
        ],
        alarms,
        now + poll * 5000,
      );
    }

    expect(alarms).toHaveLength(1);
    expect(alarms[0].id).toBe(first.id);
    expect(alarmState(alarms[0])).toBe('returned-unacknowledged');
  });

  it('raises a separate alarm for a genuinely separate excursion on the same metric', () => {
    const old = { ...anomaly, started_at: now - 600_000, ended_at: now - 480_000 };
    const fresh = { ...anomaly, id: 'fresh', started_at: now - 30_000, ended_at: now + 60_000 };

    const alarms = toAlarms([old, fresh], [], now);

    expect(alarms).toHaveLength(2);
    expect(alarms.map((a) => alarmState(a)).sort()).toEqual([
      'returned-unacknowledged',
      'unacknowledged',
    ]);
  });

  it('raises separate alarms for separate metrics on the same machine', () => {
    const alarms = toAlarms([anomaly, { ...anomaly, id: 'v', metric: 'vibration' }], [], now);
    expect(alarms.map((a) => a.metric).sort()).toEqual(['temperature', 'vibration']);
  });

  it('carries the local acknowledgement across polls', () => {
    const acknowledged = [{ ...toAlarms([anomaly], [], now)[0], acknowledgedAt: now }];
    const [next] = toAlarms([anomaly], acknowledged, now + 5000);
    expect(next.acknowledgedAt).toBe(now);
    expect(alarmState(next)).toBe('acknowledged');
  });

  it('clears an unacknowledged alarm whose excursion stopped being reported', () => {
    const previous = toAlarms([anomaly], [], now);
    const next = toAlarms([], previous, now + 5000);
    expect(next).toHaveLength(1);
    expect(alarmState(next[0])).toBe('returned-unacknowledged');
  });

  it('drops an alarm once it has both cleared and been acknowledged', () => {
    const previous = [{ ...toAlarms([anomaly], [], now)[0], acknowledgedAt: now }];
    expect(toAlarms([], previous, now + 5000)).toHaveLength(0);
  });

  it('uses the metric definition of an unknown machine without inventing a limit', () => {
    const [alarm] = toAlarms([{ ...anomaly, device_id: 'kiln-99', metric: 'vibration' }], [], now);
    expect(alarm.assetId).toBe('kiln-99');
    expect(alarm.unit).toBe('mm/s');
    expect(alarm.threshold).toBe(63);
  });
});
