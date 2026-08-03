/**
 * One machine in full, as a dialog over the running screen.
 *
 * The overview grid answers "which machine"; this answers "what is it doing",
 * which is a different question and belongs on a different layer. Putting it in
 * an overlay is what lets the answer be complete: every metric the asset has
 * gets a full trend with its limits, instead of the first two that fitted into a
 * pane the overview had to share.
 *
 * The grid comes from the asset's own metric list, so a machine with four
 * metrics draws four trends and one with two draws two. Nothing here counts
 * slots, which is the defect this replaces.
 *
 * The dialog mechanics (scrim, focus trap, Escape, backdrop press) live in
 * DialogShell, which is this dialog's own code factored out for reuse.
 */

import { useRef } from 'react';
import type { Alarm, Asset, History } from '../../types';
import { assetLevel } from '../../lib/fleetStats';
import { DialogShell } from './DialogShell';
import { TrendChart } from './TrendChart';
import { AlarmsPanel } from './AlarmsPanel';
import { StatusIndicator } from './StatusIndicator';

interface AssetFaceplateProps {
  asset: Asset;
  history: History;
  alarms: readonly Alarm[];
  now: number;
  onAcknowledge: (alarmId: string) => void;
  onClose: () => void;
}

export function AssetFaceplate({
  asset,
  history,
  alarms,
  now,
  onAcknowledge,
  onClose,
}: AssetFaceplateProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const level = assetLevel(asset);
  const stateLabel = asset.state === 'fault' ? 'Fault' : asset.state === 'idle' ? 'Idle' : 'Running';

  return (
    <DialogShell
      onClose={onClose}
      scrimTestId="faceplate-scrim"
      ariaLabel={`${asset.spec.id} faceplate`}
      dialogClassName="flex max-h-[85vh] w-full max-w-5xl flex-col"
      initialFocusRef={closeRef}
    >
      <header className="flex items-center justify-between gap-3 border-b border-hmi-grid px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-mono text-sm font-semibold tracking-wide text-hmi-primary">
            {asset.spec.id}
          </h2>
          <p className="truncate text-xs text-hmi-muted">{asset.spec.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusIndicator level={level} label={stateLabel} />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="border border-hmi-axis px-2 py-1 text-xs uppercase tracking-wider text-hmi-secondary transition-colors hover:bg-hmi-raised focus:outline-none focus-visible:ring-1 focus-visible:ring-hmi-secondary"
          >
            Close
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {asset.spec.metrics.map((spec) => (
            <TrendChart
              key={spec.key}
              assetId={asset.spec.id}
              spec={spec}
              samples={history[`${asset.spec.id}:${spec.key}`] ?? []}
            />
          ))}
        </div>

        <footer className="mt-4">
          <AlarmsPanel
            alarms={alarms}
            now={now}
            onAcknowledge={onAcknowledge}
            assetId={asset.spec.id}
            ariaLabel={`${asset.spec.id} alarms`}
            emptyText="No active alarms for this asset."
          />
        </footer>
      </div>
    </DialogShell>
  );
}
