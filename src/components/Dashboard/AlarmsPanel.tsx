/**
 * Alarm list.
 *
 * Shows the lifecycle rather than a feed of messages. Each row states severity in
 * words, when it was raised, how long it has been running, and which limit was
 * crossed with the value that crossed it. Acknowledging is a transition: the row
 * stays, restated as acknowledged, and only leaves once the reading has also
 * returned to normal.
 *
 * The same list serves the fleet column and a single asset's faceplate. Scoping
 * it to one asset is three optional props rather than a second component, so an
 * alarm reads and acknowledges identically wherever it is shown.
 */

import type { Alarm, AlarmState } from '../../types';
import { alarmDuration, alarmState, formatDuration, isOpen } from '../../lib/alarms';
import { formatClock, formatValue } from '../../lib/format';

interface AlarmsPanelProps {
  alarms: readonly Alarm[];
  now: number;
  onAcknowledge: (alarmId: string) => void;
  /** Restrict the list to one asset. Omitted, the whole fleet is listed. */
  assetId?: string;
  /** Accessible name. Must differ from the fleet list when both are on screen. */
  ariaLabel?: string;
  /** Empty state sentence, since the fleet wording is wrong for one asset. */
  emptyText?: string;
}

const stateLabel: Record<AlarmState, string> = {
  unacknowledged: 'Unacknowledged',
  acknowledged: 'Acknowledged',
  'returned-unacknowledged': 'Returned, unacknowledged',
  cleared: 'Cleared',
};

const severityGlyph = { warning: '▲', alarm: '■' } as const;
const severityTone = { warning: 'text-hmi-warning', alarm: 'text-hmi-alarm' } as const;

export function AlarmsPanel({
  alarms,
  now,
  onAcknowledge,
  assetId,
  ariaLabel = 'Alarms',
  emptyText = 'No active alarms. Fleet within limits.',
}: AlarmsPanelProps) {
  const scoped = assetId === undefined ? alarms : alarms.filter((a) => a.assetId === assetId);
  const open = scoped.filter(isOpen).slice().reverse();

  return (
    <section
      className="border border-hmi-grid bg-hmi-panel"
      aria-label={ariaLabel}
    >
      <header className="flex items-baseline justify-between border-b border-hmi-grid px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-hmi-secondary">
          Alarms
        </h2>
        <span className="font-mono text-xs tabular-nums text-hmi-muted">{open.length} open</span>
      </header>

      {open.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-hmi-muted">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-hmi-grid">
          {open.map((alarm) => {
            const state = alarmState(alarm);
            const acked = alarm.acknowledgedAt !== undefined;

            return (
              <li key={alarm.id} className="px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5">
                      <span aria-hidden="true" className={`text-[10px] ${severityTone[alarm.severity]}`}>
                        {severityGlyph[alarm.severity]}
                      </span>
                      <span className="font-mono text-sm text-hmi-primary">{alarm.assetId}</span>
                      <span className="text-xs uppercase tracking-wide text-hmi-secondary">
                        {alarm.severity}
                      </span>
                    </p>
                    <p className="mt-0.5 font-mono text-xs tabular-nums text-hmi-secondary">
                      {alarm.metric} {formatValue(alarm.peakValue, alarm)} {alarm.unit} past{' '}
                      {formatValue(alarm.threshold, alarm)} {alarm.unit}
                    </p>
                    <p className="mt-0.5 text-xs text-hmi-muted">
                      <span className="font-mono tabular-nums">{formatClock(alarm.raisedAt)}</span>
                      {' · '}
                      <span className="font-mono tabular-nums">
                        {formatDuration(alarmDuration(alarm, now))}
                      </span>
                      {' · '}
                      {stateLabel[state]}
                    </p>
                  </div>

                  {!acked ? (
                    <button
                      type="button"
                      onClick={() => onAcknowledge(alarm.id)}
                      className="shrink-0 border border-hmi-axis px-2 py-1 text-xs uppercase tracking-wider text-hmi-secondary transition-colors hover:bg-hmi-raised focus:outline-none focus-visible:ring-1 focus-visible:ring-hmi-secondary"
                    >
                      Ack
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
