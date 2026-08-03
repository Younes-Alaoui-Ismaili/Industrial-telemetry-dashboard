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
 * Written against the DOM rather than pulled from a package, matching the boot
 * overlay: a dialog that closes three ways and keeps focus inside is a few lines
 * of event handling, and a dependency for it would outweigh the whole feature.
 */

import { useEffect, useRef } from 'react';
import type { Alarm, Asset, History } from '../../types';
import { assetLevel } from '../../lib/fleetStats';
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

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function AssetFaceplate({
  asset,
  history,
  alarms,
  now,
  onAcknowledge,
  onClose,
}: AssetFaceplateProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const level = assetLevel(asset);
  const stateLabel = asset.state === 'fault' ? 'Fault' : asset.state === 'idle' ? 'Idle' : 'Running';

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  /**
   * Escape closes, Tab cycles inside. The listener sits on the document, not on
   * the dialog: clicking a chart moves focus to the body, and a dialog scoped
   * handler would then hear neither key.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusables = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusables.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      data-testid="faceplate-scrim"
      className="fixed inset-0 z-50 flex items-center justify-center bg-hmi-page/80 p-4"
      // Closing on mousedown, and only when the press landed on the scrim
      // itself, so a drag that starts on a chart and ends outside does not
      // dismiss the dialog under the operator's hand.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${asset.spec.id} faceplate`}
        tabIndex={-1}
        className="flex max-h-[85vh] w-full max-w-5xl flex-col border border-hmi-grid bg-hmi-panel"
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
      </div>
    </div>
  );
}
