/**
 * Fleet level rollups for the status bar.
 */

import type { Asset, MetricLevel } from '../types';
import { evaluate, worstLevel } from './thresholds';

export function assetLevel(asset: Asset): MetricLevel {
  const levels: MetricLevel[] = [];
  for (const spec of asset.spec.metrics) {
    const value = asset.values[spec.key];
    if (value !== undefined) levels.push(evaluate(value, spec));
  }
  return worstLevel(levels);
}

export function onlineCount(assets: readonly Asset[]): number {
  return assets.filter((a) => a.state !== 'offline').length;
}

/**
 * Share of the fleet that is online and not in fault, as a percentage rounded to
 * one decimal. An empty fleet reports 100 rather than dividing by zero.
 */
export function availability(assets: readonly Asset[]): number {
  if (assets.length === 0) return 100;
  const healthy = assets.filter((a) => a.state !== 'offline' && a.state !== 'fault').length;
  return Math.round((healthy / assets.length) * 1000) / 10;
}
