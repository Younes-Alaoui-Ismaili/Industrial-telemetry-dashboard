/**
 * Which two trends the fixed context zone should be showing.
 *
 * The overview screen answers "is the plant normal", so its trends belong to the
 * plant, not to whichever tile was last clicked. Ranking is decision logic and
 * lives here as a pure function: the screen asks what matters most and draws it,
 * without owning the argument about what "most" means.
 *
 * Proximity is normalised against each metric's own nominal to limit span, which
 * is what lets a temperature in C and a vibration in mm/s be compared at all.
 */

import type { Asset, MetricSpec } from '../types';
import { evaluate, hasLimits } from './thresholds';

export interface TrendCandidate {
  assetId: string;
  spec: MetricSpec;
}

/** How many trends the fixed context zone shows. */
export const CRITICAL_TREND_COUNT = 2;

/**
 * Incumbent bonus, as a fraction of the nominal to limit span.
 *
 * Without it, a quiet fleet reshuffles the zone on nearly every tick, because
 * simulator jitter moves same level candidates past each other by a few percent.
 * Charts that swap every two seconds are unreadable, and an operator learns
 * nothing from a pane that never sits still. A genuine escalation still preempts
 * instantly, because level is compared before proximity.
 */
export const HYSTERESIS = 0.1;

const levelRank = { alarm: 2, warning: 1, normal: 0 } as const;

/**
 * How far a reading has travelled from its nominal towards its limit, as a
 * fraction. Degenerate specs, where the limit is not above nominal, score zero
 * rather than infinity, so they sort last instead of hijacking the zone.
 */
function proximity(value: number, spec: MetricSpec): number {
  const limit = spec.alarm ?? spec.warn;
  if (limit === undefined) return 0;
  const span = limit - spec.nominal;
  if (span <= 0) return 0;
  return (value - spec.nominal) / span;
}

function isSame(a: TrendCandidate, b: TrendCandidate): boolean {
  return a.assetId === b.assetId && a.spec.key === b.spec.key;
}

/**
 * The `count` most critical trends across the fleet, worst first.
 *
 * Metrics without limits, counters among them, are never candidates: there is no
 * such thing as a critical cycle count, and a monotonic ramp says nothing about
 * plant state. Pass the previous picks to hold the zone steady between ticks.
 */
export function pickCriticalTrends(
  assets: readonly Asset[],
  count: number,
  previous: readonly TrendCandidate[] = [],
): TrendCandidate[] {
  const scored: { candidate: TrendCandidate; rank: number; score: number }[] = [];

  for (const asset of assets) {
    for (const spec of asset.spec.metrics) {
      if (!hasLimits(spec)) continue;
      const value = asset.values[spec.key];
      if (value === undefined) continue;

      const candidate: TrendCandidate = { assetId: asset.spec.id, spec };
      const incumbent = previous.some((p) => isSame(p, candidate));

      scored.push({
        candidate,
        rank: levelRank[evaluate(value, spec)],
        score: proximity(value, spec) + (incumbent ? HYSTERESIS : 0),
      });
    }
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return b.rank - a.rank;
    if (a.score !== b.score) return b.score - a.score;
    const byAsset = a.candidate.assetId.localeCompare(b.candidate.assetId);
    if (byAsset !== 0) return byAsset;
    return a.candidate.spec.key.localeCompare(b.candidate.spec.key);
  });

  return scored.slice(0, count).map((s) => s.candidate);
}
