import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from './components/Dashboard/StatusBar';
import { AssetTile } from './components/Dashboard/AssetTile';
import { TrendChart } from './components/Dashboard/TrendChart';
import { AlarmsPanel } from './components/Dashboard/AlarmsPanel';
import { AssetFaceplate } from './components/Dashboard/AssetFaceplate';
import { SourceBanner } from './components/Dashboard/SourceBanner';
import { SourceSelector } from './components/Dashboard/SourceSelector';
import { BootOverlay } from './components/Dashboard/BootOverlay';
import { useSimulatedData } from './hooks/useSimulatedData';
import { useMcpData } from './hooks/useMcpData';
import { useBootPhase } from './hooks/useBootPhase';
import { useChartsPainted } from './hooks/useChartsPainted';
import type { DataSourceId } from './types/mcp';
import {
  CRITICAL_TREND_COUNT,
  pickCriticalTrends,
  type TrendCandidate,
} from './lib/trendPriority';

/**
 * Screen layout follows the usual supervision hierarchy: the header answers "is
 * the plant normal", the grid answers "which machine", and the trends answer "how
 * bad and for how long". All three are about the plant, so the trend pane shows
 * the fleet's most critical metrics and is steered by nothing.
 *
 * One machine in depth is a different question and lives one layer up, in the
 * faceplate a tile opens. That separation is the point: a pane sized for the
 * overview cannot hold every metric of every asset, and the version that tried
 * silently showed the first two and dropped the rest.
 *
 * Two data sources feed the same components. The simulator is the default and
 * needs nothing installed; the live source reads a real telemetry MCP server
 * through a local bridge. Both hooks always run, because hooks cannot be called
 * conditionally, but the live one does no work until it is selected.
 *
 * When the live source is selected and not reachable, the screen keeps running
 * on the simulator and says so twice, in the banner and in the header. It never
 * shows simulated readings under a live label.
 */
function App() {
  const [source, setSource] = useState<DataSourceId>('simulated');

  const simulated = useSimulatedData();
  const mcp = useMcpData({ enabled: source === 'mcp' });

  const live = source === 'mcp' && mcp.connection.status === 'live';
  const fallback = source === 'mcp' && !live;
  const data = live ? mcp : simulated;

  const { assets, alarms, history, lastUpdate, acknowledge, injectFault } = data;

  const [faceplateId, setFaceplateId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  /**
   * Last render's picks, fed back in so the zone holds still between ticks. Read
   * inside the memo and written from an effect, never during a render.
   */
  const previousPicks = useRef<TrendCandidate[]>([]);
  const criticalTrends = useMemo(
    () => pickCriticalTrends(assets, CRITICAL_TREND_COUNT, previousPicks.current),
    [assets],
  );
  useEffect(() => {
    previousPicks.current = criticalTrends;
  }, [criticalTrends]);

  const faceplateAsset = assets.find((a) => a.spec.id === faceplateId);

  const closeFaceplate = useCallback(() => {
    setFaceplateId(null);
    openerRef.current?.focus();
    openerRef.current = null;
  }, []);

  /**
   * The tile that opened the dialog, captured from the event rather than read
   * off the document later: a click does not focus a div in every browser, and
   * focus has to land back where it started when the dialog closes.
   */
  const openFaceplate = (assetId: string, opener: HTMLElement) => {
    openerRef.current = opener;
    setFaceplateId(assetId);
  };

  /** A fleet can shrink under the dialog when the source changes. */
  useEffect(() => {
    if (faceplateId !== null && faceplateAsset === undefined) closeFaceplate();
  }, [faceplateId, faceplateAsset, closeFaceplate]);

  /**
   * The fact the boot overlay waits on, per source.
   *
   * Simulated: the metric the trend pane is about to draw already has a sample,
   * which the seeded history makes true on the first render.
   *
   * Live: the connection attempt has finished, whatever it concluded. A failed
   * attempt is as good a reason to leave as a successful one, because the screen
   * behind states the fallback in words; holding the overlay up until something
   * succeeds would be waiting for an outcome that may never come.
   */
  const bootReady =
    source === 'mcp'
      ? mcp.connection.status !== 'connecting'
      : criticalTrends.length > 0 &&
        (history[`${criticalTrends[0].assetId}:${criticalTrends[0].spec.key}`]?.length ?? 0) > 0;

  const boot = useBootPhase(bootReady);

  /**
   * The one milestone that is genuinely later than the overlay itself. The first
   * two are true the instant it mounts, so without this the progress bar would
   * open two thirds full and jump rather than fill.
   */
  const trendsRef = useRef<HTMLElement | null>(null);
  const chartsPainted = useChartsPainted(trendsRef, boot.mounted);

  const bootSteps = [
    { label: 'Fleet definition loaded', done: assets.length > 0 },
    {
      label: source === 'mcp' ? 'Bridge answered' : 'Trend buffer primed',
      done: bootReady,
    },
    { label: 'Trend charts drawn', done: chartsPainted },
    { label: 'Screen ready', done: boot.leaving },
  ];

  return (
    <div className="min-h-screen bg-hmi-page text-hmi-primary" aria-busy={boot.mounted}>
      <StatusBar
        assets={assets}
        alarms={alarms}
        lastUpdate={lastUpdate}
        sourceLabel={live ? 'MCP live' : fallback ? 'Simulated (fallback)' : 'Simulated'}
        fallback={fallback}
        selector={<SourceSelector value={source} onChange={setSource} />}
      />
      {source === 'mcp' ? <SourceBanner connection={mcp.connection} /> : null}

      <main className="mx-auto max-w-[1600px] px-4 py-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <section aria-label="Fleet">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-hmi-secondary">
                Fleet
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {assets.map((asset) => (
                  <div
                    key={asset.spec.id}
                    role="button"
                    tabIndex={0}
                    aria-haspopup="dialog"
                    onClick={(e) => openFaceplate(asset.spec.id, e.currentTarget)}
                    onKeyDown={(e) => {
                      // A key pressed on the inject button belongs to the
                      // button. Its click stops here, but the keystroke that
                      // produced the click travels on its own and would open
                      // the dialog behind it.
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openFaceplate(asset.spec.id, e.currentTarget);
                      }
                    }}
                    className="cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-hmi-secondary"
                  >
                    <AssetTile asset={asset} history={history} onInjectFault={injectFault} />
                  </div>
                ))}
              </div>
            </section>

            {assets.length > 0 ? (
              <section aria-label="Fleet critical trends" className="space-y-3" ref={trendsRef}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-xs font-semibold uppercase tracking-widest text-hmi-secondary">
                    Fleet critical trends
                  </h2>
                  <p className="truncate text-xs text-hmi-muted">
                    The two metrics closest to their limits, fleet wide. Open a machine for all of
                    its trends.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {criticalTrends.map(({ assetId, spec }) => (
                    <TrendChart
                      key={`${assetId}:${spec.key}`}
                      assetId={assetId}
                      spec={spec}
                      samples={history[`${assetId}:${spec.key}`] ?? []}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <AlarmsPanel alarms={alarms} now={lastUpdate} onAcknowledge={acknowledge} />
        </div>
      </main>

      {faceplateAsset ? (
        <AssetFaceplate
          asset={faceplateAsset}
          history={history}
          alarms={alarms}
          now={lastUpdate}
          onAcknowledge={acknowledge}
          onClose={closeFaceplate}
        />
      ) : null}

      {boot.mounted ? (
        <BootOverlay
          source={source}
          steps={bootSteps}
          leaving={boot.leaving}
          animated={boot.animated}
        />
      ) : null}
    </div>
  );
}

export default App;
