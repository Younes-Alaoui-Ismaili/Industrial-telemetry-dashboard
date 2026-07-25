/**
 * Fleet header.
 *
 * Answers the shift-start question in one glance: is the plant normal, how many
 * machines are up, how many alarms are outstanding and by what severity, and how
 * fresh is what I am looking at. Counts stay in neutral ink when they are zero, so
 * the bar is colourless until something is actually wrong.
 */

import type { Alarm, Asset } from '../../types';
import { countBySeverity } from '../../lib/alarms';
import { availability, onlineCount } from '../../lib/fleetStats';
import { formatClock } from '../../lib/format';

interface StatusBarProps {
  assets: readonly Asset[];
  alarms: readonly Alarm[];
  lastUpdate: number;
}

function Stat({
  label,
  value,
  tone = 'text-hmi-primary',
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-hmi-muted">{label}</span>
      <span className={`font-mono text-lg leading-none tabular-nums ${tone}`}>{value}</span>
    </div>
  );
}

export function StatusBar({ assets, alarms, lastUpdate }: StatusBarProps) {
  const counts = countBySeverity(alarms);
  const online = onlineCount(assets);

  return (
    <header className="border-b border-hmi-grid bg-hmi-panel">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-end gap-x-8 gap-y-4 px-4 py-3">
        <div className="mr-4">
          <h1 className="text-sm font-semibold uppercase tracking-widest text-hmi-primary">
            Industrial Telemetry Dashboard
          </h1>
          <p className="text-xs text-hmi-muted">Fleet supervision</p>
        </div>

        <Stat label="Assets online" value={`${online}/${assets.length}`} />
        <Stat
          label="Alarm"
          value={String(counts.alarm)}
          tone={counts.alarm > 0 ? 'text-hmi-alarm' : 'text-hmi-muted'}
        />
        <Stat
          label="Warning"
          value={String(counts.warning)}
          tone={counts.warning > 0 ? 'text-hmi-warning' : 'text-hmi-muted'}
        />
        <Stat label="Availability" value={`${availability(assets).toFixed(1)}%`} />
        <Stat label="Updated" value={formatClock(lastUpdate)} tone="text-hmi-secondary" />
      </div>
    </header>
  );
}
