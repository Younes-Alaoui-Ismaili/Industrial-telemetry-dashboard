import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from './components/Dashboard/StatusBar';
import { EquipmentTable } from './components/Dashboard/EquipmentTable';
import { FleetHistoryChart } from './components/Dashboard/FleetHistoryChart';
import { AlarmsPanel } from './components/Dashboard/AlarmsPanel';
import { AssetFaceplate } from './components/Dashboard/AssetFaceplate';
import { ConnectMcpModal } from './components/Dashboard/ConnectMcpModal';
import { SourceBanner } from './components/Dashboard/SourceBanner';
import { SourceSelector } from './components/Dashboard/SourceSelector';
import { BootOverlay } from './components/Dashboard/BootOverlay';
import { useSimulatedData } from './hooks/useSimulatedData';
import { useMcpData } from './hooks/useMcpData';
import { useCloudData } from './hooks/useCloudData';
import { CloudSourcePanel } from './components/Dashboard/CloudSourcePanel';
import { probeBridge } from './lib/bridgeProbe';
import { useBootPhase } from './hooks/useBootPhase';
import { useChartsPainted } from './hooks/useChartsPainted';
import type { DataSourceId } from './types/mcp';
/** ThingsBoard-inspired workspace, preserving source and alarm contracts. */
function App() {
  const [source, setSource] = useState<DataSourceId>(() => !import.meta.env.VITE_AZURE_PROOF_VIDEO_URL && !import.meta.env.VITE_DEMO_VIDEO_URL && !import.meta.env.VITE_CLOUD_DASHBOARD_URL && new URLSearchParams(window.location.search).get('source') === 'cloud' ? 'cloud' : 'simulated');

  const [cloudToken, setCloudToken] = useState('');
  const cloud = useCloudData({ enabled: source === 'cloud', token: cloudToken });
  const canAcknowledge = source !== 'cloud' || cloud.isOperator;
  const simulated = useSimulatedData();
  const mcp = useMcpData({ enabled: source === 'mcp' });

  const live = source === 'mcp' && mcp.connection.status === 'live';
  const fallback = source === 'mcp' && !live;
  const data = source === 'cloud' ? cloud : live ? mcp : simulated;

  const { assets, alarms, history, lastUpdate, acknowledge, injectFault } = data;

  const [faceplateId, setFaceplateId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const [connectHelpOpen, setConnectHelpOpen] = useState(false);
  const connectOpenerRef = useRef<HTMLElement | null>(null);
  // A ref, not state: the pending window needs no render, only a latch that
  // keeps a second press from racing a second probe.
  const probePending = useRef(false);

  /**
   * Probe first. The live radio only carries the source when the bridge
   * answers; a bridge that does not answer gets the connect guide instead, and
   * the source stays on the simulator the whole time. That ordering is what
   * makes closing the guide need no rollback: nothing switched.
   */
  const handleSourceChange = (next: DataSourceId, control: HTMLInputElement) => {
    if (next !== 'mcp') {
      setSource(next);
      return;
    }
    if (source === 'mcp' || probePending.current) return;
    probePending.current = true;
    connectOpenerRef.current = control;
    void probeBridge().then((reachable) => {
      probePending.current = false;
      if (reachable) {
        setSource('mcp');
        return;
      }
      // One dialog at a time: a faceplate opened during the probe window
      // yields to the guide. Dropped without closeFaceplate, which would
      // steal focus back to the tile.
      setFaceplateId(null);
      openerRef.current = null;
      setConnectHelpOpen(true);
    });
  };

  const closeConnectHelp = useCallback(() => {
    setConnectHelpOpen(false);
    connectOpenerRef.current?.focus();
    connectOpenerRef.current = null;
  }, []);

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
  const bootReady = source === 'cloud' ? cloud.connection.status !== 'connecting' :
    source === 'mcp'
      ? mcp.connection.status !== 'connecting'
      : assets.some(asset => (history[`${asset.spec.id}:temperature`]?.length ?? 0) > 0);

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
    <div className="industrial-app min-h-screen bg-hmi-page text-hmi-primary" aria-busy={boot.mounted}>
      <StatusBar
        assets={assets}
        alarms={alarms}
        lastUpdate={lastUpdate}
        dataAvailable={source !== 'cloud' || (cloud.connection.status === 'live' && assets.length > 0)}
        sourceLabel={source === 'cloud' ? (cloud.connection.status === 'live' ? 'Cloud API (' + cloud.deployment + ', simulated data)' : 'Cloud API unavailable') : live ? 'MCP live' : fallback ? 'Simulated (fallback)' : 'Simulated'}
        fallback={fallback}
        selector={<SourceSelector value={source} onChange={handleSourceChange} />}
      />
      {source === 'mcp' ? <SourceBanner connection={mcp.connection} /> : null}
      {source === 'cloud' ? <CloudSourcePanel connection={cloud.connection} deployment={cloud.deployment} isOperator={cloud.isOperator} report={cloud.report} onToken={setCloudToken} /> : null}

      <main className="industrial-main">
        <div className="workspace-heading"><div><h2>Process overview</h2><p>{source === 'simulated' || fallback ? 'Autonomous demonstration · Synthetic measurements generated in your browser' : 'Source status and provenance are shown above'}</p></div><a href="https://github.com/Younes-Alaoui-Ismaili/Industrial-telemetry-dashboard/tree/main/evidence">Recorded evidence</a></div>
        <div className="overview-grid">
          <EquipmentTable assets={assets} onOpen={openFaceplate} onInjectFault={injectFault} />
          <AlarmsPanel dataAvailable={source !== 'cloud' || cloud.connection.status === 'live'} alarms={alarms} now={lastUpdate} onAcknowledge={acknowledge} canAcknowledge={canAcknowledge} emptyText={source === 'cloud' && cloud.connection.status !== 'live' ? 'Alarm source unavailable.' : undefined} />
        </div>
        {assets.length > 0 ? <section aria-label="Fleet history" className="history-grid" ref={trendsRef}>
          <FleetHistoryChart assets={assets} history={history} metric="temperature" />
          <FleetHistoryChart assets={assets} history={history} metric="vibration" />
        </section> : null}
        <footer className="workspace-footer">Industrial process monitoring · Browser simulator / MCP / authenticated API<span>Layout inspired by ThingsBoard · Independent React demonstration</span></footer>
      </main>

      {faceplateAsset ? (
        <AssetFaceplate
          asset={faceplateAsset}
          history={history}
          alarms={alarms}
          now={lastUpdate}
          onAcknowledge={acknowledge}
          canAcknowledge={canAcknowledge}
          onClose={closeFaceplate}
        />
      ) : null}

      {connectHelpOpen ? <ConnectMcpModal onClose={closeConnectHelp} /> : null}

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
