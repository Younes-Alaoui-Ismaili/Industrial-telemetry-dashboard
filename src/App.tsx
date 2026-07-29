import { useMemo, useState } from 'react';
import { StatusBar } from './components/Dashboard/StatusBar';
import { AssetTile } from './components/Dashboard/AssetTile';
import { TrendChart } from './components/Dashboard/TrendChart';
import { AlarmsPanel } from './components/Dashboard/AlarmsPanel';
import { SourceBanner } from './components/Dashboard/SourceBanner';
import { SourceSelector } from './components/Dashboard/SourceSelector';
import { BootOverlay } from './components/Dashboard/BootOverlay';
import { useSimulatedData } from './hooks/useSimulatedData';
import { useMcpData } from './hooks/useMcpData';
import { useBootPhase } from './hooks/useBootPhase';
import type { DataSourceId } from './types/mcp';
import { assetLevel } from './lib/fleetStats';
import { hasLimits } from './lib/thresholds';

/**
 * Screen layout follows the usual supervision hierarchy: the header answers "is
 * the plant normal", the grid answers "which machine", and the trends answer "how
 * bad and for how long". Trends focus on whichever asset is currently worst, so
 * the detail pane follows the problem instead of needing to be steered.
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const focus = useMemo(() => {
    const abnormal = assets.find((a) => assetLevel(a) !== 'normal');
    return assets.find((a) => a.spec.id === selectedId) ?? abnormal ?? assets[0];
  }, [assets, selectedId]);

  const trendMetrics = focus ? focus.spec.metrics.filter(hasLimits).slice(0, 2) : [];

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
      : focus !== undefined &&
        trendMetrics.length > 0 &&
        (history[`${focus.spec.id}:${trendMetrics[0].key}`]?.length ?? 0) > 0;

  const boot = useBootPhase(bootReady);

  const bootSteps = [
    { label: 'Fleet definition loaded', done: assets.length > 0 },
    {
      label: source === 'mcp' ? 'Bridge answered' : 'Trend buffer primed',
      done: bootReady,
    },
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
                    onClick={() => setSelectedId(asset.spec.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(asset.spec.id);
                      }
                    }}
                    className="cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-hmi-secondary"
                  >
                    <AssetTile asset={asset} history={history} onInjectFault={injectFault} />
                  </div>
                ))}
              </div>
            </section>

            {focus ? (
              <section aria-label="Trends" className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-hmi-secondary">
                  Trends
                </h2>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {trendMetrics.map((spec) => (
                    <TrendChart
                      key={spec.key}
                      assetId={focus.spec.id}
                      spec={spec}
                      samples={history[`${focus.spec.id}:${spec.key}`] ?? []}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <AlarmsPanel alarms={alarms} now={lastUpdate} onAcknowledge={acknowledge} />
        </div>
      </main>

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
