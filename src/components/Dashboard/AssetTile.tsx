/**
 * One machine in the fleet grid.
 *
 * Dense by design: tag, state, every live reading with its unit, and a micro
 * trend, all readable without interaction. The left edge takes a status colour
 * only when something is abnormal, so a healthy grid is quiet and an excursion is
 * the only coloured thing on screen.
 *
 * The tile is also the way into that machine's faceplate, so the whole surface
 * is a click target. Injecting a fault is the one thing on it that is not that,
 * and it says so by stopping the click from travelling any further.
 */

import type { Asset, History, MetricLevel } from '../../types';
import { evaluate } from '../../lib/thresholds';
import { assetLevel } from '../../lib/fleetStats';
import { formatValue } from '../../lib/format';
import { Sparkline } from './Sparkline';
import { StatusIndicator } from './StatusIndicator';

interface AssetTileProps {
  asset: Asset;
  history: History;
  onInjectFault: (assetId: string) => void;
}

const edge: Record<MetricLevel, string> = {
  normal: 'border-l-hmi-axis',
  warning: 'border-l-hmi-warning',
  alarm: 'border-l-hmi-alarm',
};

const valueTone: Record<MetricLevel, string> = {
  normal: 'text-hmi-primary',
  warning: 'text-hmi-warning',
  alarm: 'text-hmi-alarm',
};

export function AssetTile({ asset, history, onInjectFault }: AssetTileProps) {
  const level = assetLevel(asset);
  const stateLabel = asset.state === 'fault' ? 'Fault' : asset.state === 'idle' ? 'Idle' : 'Running';

  return (
    <article
      className={`border border-hmi-grid border-l-2 bg-hmi-panel p-3 transition-colors hover:bg-hmi-raised ${edge[level]}`}
      aria-label={`${asset.spec.id} ${asset.spec.name}`}
    >
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-mono text-sm font-semibold tracking-wide text-hmi-primary">
            {asset.spec.id}
          </h3>
          <p className="truncate text-xs text-hmi-muted">{asset.spec.name}</p>
        </div>
        <StatusIndicator level={level} label={stateLabel} />
      </header>

      <dl className="space-y-1">
        {asset.spec.metrics.map((spec) => {
          const value = asset.values[spec.key];
          if (value === undefined) return null;
          const metricLevel = evaluate(value, spec);
          const samples = history[`${asset.spec.id}:${spec.key}`] ?? [];

          return (
            <div key={spec.key} className="flex items-center justify-between gap-2">
              <dt className="w-16 shrink-0 text-xs text-hmi-muted">{spec.label}</dt>
              <dd
                className={`flex-1 text-right font-mono text-sm tabular-nums ${valueTone[metricLevel]}`}
              >
                {formatValue(value, spec)}
                {spec.unit ? <span className="ml-1 text-xs text-hmi-muted">{spec.unit}</span> : null}
              </dd>
              <div className="w-24 shrink-0">
                <Sparkline samples={samples} level={metricLevel} />
              </div>
            </div>
          );
        })}
      </dl>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onInjectFault(asset.spec.id);
        }}
        className="mt-3 w-full border border-hmi-axis px-2 py-1 text-xs uppercase tracking-wider text-hmi-secondary transition-colors hover:bg-hmi-raised focus:outline-none focus-visible:ring-1 focus-visible:ring-hmi-secondary"
      >
        Inject fault
      </button>
    </article>
  );
}
