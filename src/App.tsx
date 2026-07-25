import { useMemo, useState } from 'react';
import { StatusBar } from './components/Dashboard/StatusBar';
import { AssetTile } from './components/Dashboard/AssetTile';
import { TrendChart } from './components/Dashboard/TrendChart';
import { AlarmsPanel } from './components/Dashboard/AlarmsPanel';
import { useSimulatedData } from './hooks/useSimulatedData';
import { assetLevel } from './lib/fleetStats';
import { hasLimits } from './lib/thresholds';

/**
 * Screen layout follows the usual supervision hierarchy: the header answers "is
 * the plant normal", the grid answers "which machine", and the trends answer "how
 * bad and for how long". Trends focus on whichever asset is currently worst, so
 * the detail pane follows the problem instead of needing to be steered.
 */
function App() {
  const { assets, alarms, history, lastUpdate, acknowledge, injectFault } = useSimulatedData();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const focus = useMemo(() => {
    const abnormal = assets.find((a) => assetLevel(a) !== 'normal');
    return assets.find((a) => a.spec.id === selectedId) ?? abnormal ?? assets[0];
  }, [assets, selectedId]);

  const trendMetrics = focus ? focus.spec.metrics.filter(hasLimits).slice(0, 2) : [];

  return (
    <div className="min-h-screen bg-hmi-page text-hmi-primary">
      <StatusBar assets={assets} alarms={alarms} lastUpdate={lastUpdate} />

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
    </div>
  );
}

export default App;
