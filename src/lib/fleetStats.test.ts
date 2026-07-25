import { describe, it, expect } from 'vitest';
import { assetLevel, availability, onlineCount } from './fleetStats';
import type { Asset, AssetSpec, AssetState } from '../types';

const spec: AssetSpec = {
  id: 'PUMP-04',
  name: 'Coolant Pump',
  kind: 'pump',
  metrics: [
    {
      key: 'temperature',
      label: 'Temp',
      unit: 'C',
      decimals: 1,
      nominal: 55,
      jitter: 0.8,
      warn: 65,
      alarm: 70,
    },
    {
      key: 'vibration',
      label: 'Vibration',
      unit: 'mm/s',
      decimals: 2,
      nominal: 1.7,
      jitter: 0.12,
      warn: 3.0,
      alarm: 3.7,
    },
  ],
};

const asset = (
  temperature: number,
  vibration: number,
  state: AssetState = 'running',
): Asset => ({ spec, state, values: { temperature, vibration }, lastSeen: 0 });

describe('assetLevel', () => {
  it('is normal when every metric is inside its limits', () => {
    expect(assetLevel(asset(55, 1.7))).toBe('normal');
  });

  it('takes the worst metric, so one alarming reading is never masked', () => {
    expect(assetLevel(asset(55, 3.9))).toBe('alarm');
    expect(assetLevel(asset(66, 1.7))).toBe('warning');
    expect(assetLevel(asset(66, 3.9))).toBe('alarm');
  });
});

describe('onlineCount', () => {
  it('counts everything that is not offline', () => {
    expect(onlineCount([asset(55, 1.7), asset(55, 1.7, 'fault'), asset(55, 1.7, 'offline')])).toBe(2);
  });
});

describe('availability', () => {
  it('is 100 for a healthy fleet', () => {
    expect(availability([asset(55, 1.7), asset(55, 1.7)])).toBe(100);
  });

  it('excludes faulted and offline assets', () => {
    expect(
      availability([asset(55, 1.7), asset(55, 1.7), asset(55, 1.7, 'fault'), asset(55, 1.7, 'offline')]),
    ).toBe(50);
  });

  it('rounds to one decimal', () => {
    const assets = [asset(55, 1.7), asset(55, 1.7), asset(55, 1.7, 'fault')];
    expect(availability(assets)).toBe(66.7);
  });

  it('does not divide by zero on an empty fleet', () => {
    expect(availability([])).toBe(100);
  });
});
