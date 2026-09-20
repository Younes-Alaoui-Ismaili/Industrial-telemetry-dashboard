/**
 * Fleet header.
 *
 * Answers the shift-start question in one glance: is the plant normal, how many
 * machines are up, how many alarms are outstanding and by what severity, and how
 * fresh is what I am looking at. Counts stay in neutral ink when they are zero, so
 * the bar is colourless until something is actually wrong.
 */

import type { ReactNode } from 'react';
import type { Alarm, Asset } from '../../types';
import { countBySeverity } from '../../lib/alarms';
import { availability, onlineCount } from '../../lib/fleetStats';
import { formatClock } from '../../lib/format';

interface StatusBarProps {
  assets: readonly Asset[];
  alarms: readonly Alarm[];
  lastUpdate: number;
  /** What is actually feeding the screen right now, in words. */
  sourceLabel: string;
  /** True when the live source was asked for and the simulator is standing in. */
  fallback?: boolean;
  /** False when source failure prevents any fleet measurement. */
  dataAvailable?: boolean;
  /** The source selector, rendered at the end of the bar. */
  selector?: ReactNode;
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

/**
 * Which source the readings come from, stated in words.
 *
 * The label is set in normal ink and the amber square is decoration, because
 * amber clears the graphical contrast bar but not the text one. The sentence
 * carries the meaning on its own.
 */
function SourceStat({ label, fallback }: { label: string; fallback: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-hmi-muted">Source</span>
      <span
        data-testid="source-label"
        className="flex items-center gap-1.5 font-mono text-xs uppercase leading-none text-hmi-primary"
      >
        {fallback ? <span aria-hidden="true" className="inline-block h-2 w-2 bg-hmi-warning" /> : null}
        {label}
      </span>
    </div>
  );
}

export function StatusBar({
  assets,
  alarms,
  lastUpdate,
  sourceLabel,
  fallback = false,
  dataAvailable = true,
  selector,
}: StatusBarProps) {
  const counts = countBySeverity(alarms);
  const online = onlineCount(assets);

  return (
    <header className="workspace-status border-b border-hmi-grid bg-hmi-panel">
      <div className="app-masthead"><h1>Industrial Telemetry Dashboard</h1><span>Process monitoring &amp; analytics</span></div>
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-end gap-x-8 gap-y-4 px-4 py-3">
        <Stat label="Assets online" value={dataAvailable ? `${online}/${assets.length}` : 'Unknown'} />
        <Stat
          label="Alarm"
          value={dataAvailable ? String(counts.alarm) : 'Unknown'}
          tone={counts.alarm > 0 ? 'text-hmi-alarm' : 'text-hmi-muted'}
        />
        <Stat
          label="Warning"
          value={dataAvailable ? String(counts.warning) : 'Unknown'}
          tone={counts.warning > 0 ? 'text-hmi-warning' : 'text-hmi-muted'}
        />
        <Stat label="Availability" value={dataAvailable ? `${availability(assets).toFixed(1)}%` : 'Unknown'} />
        <Stat label="Updated" value={dataAvailable ? formatClock(lastUpdate) : 'No data'} tone="text-hmi-secondary" />
        <SourceStat label={sourceLabel} fallback={fallback} />

        {selector ? <div className="ml-auto">{selector}</div> : null}
      </div>
    </header>
  );
}
