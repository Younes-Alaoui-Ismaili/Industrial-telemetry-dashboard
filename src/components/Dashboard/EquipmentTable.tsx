import { useState } from 'react';
import type { Asset } from '../../types';
import { assetLevel } from '../../lib/fleetStats';
import { formatClock, formatValue } from '../../lib/format';
import { StatusIndicator } from './StatusIndicator';

export function EquipmentTable({ assets, onOpen, onInjectFault }: {
  assets: readonly Asset[];
  onOpen: (id: string, opener: HTMLElement) => void;
  onInjectFault?: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = assets.filter(a => `${a.spec.id} ${a.spec.name}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="equipment-panel industrial-panel" aria-label="Fleet">
    <header className="panel-heading">
      <div><h2>Equipment</h2><p>{assets.length} assets · Select an asset to inspect all measurements</p></div>
      <input type="search" aria-label="Search equipment" placeholder="Search equipment" value={query} onChange={e => setQuery(e.target.value)} />
    </header>
    <div className="equipment-scroll">
      <table aria-label="Equipment measurements" className="equipment-table">
        <thead><tr><th scope="col">Equipment</th><th scope="col">Temperature</th><th scope="col">Vibration</th><th scope="col">State</th><th scope="col">Updated</th>{onInjectFault ? <th scope="col">Simulation</th> : null}</tr></thead>
        <tbody>{filtered.map(asset => <tr key={asset.spec.id} aria-label={`${asset.spec.id} ${asset.spec.name} equipment`}>
          <td><button className="equipment-name" aria-haspopup="dialog" onClick={e => onOpen(asset.spec.id, e.currentTarget)}>{asset.spec.id}<span>{asset.spec.name}</span></button></td>
          {(['temperature', 'vibration'] as const).map(key => {
            const spec = asset.spec.metrics.find(m => m.key === key);
            const value = asset.values[key];
            return <td key={key} className="metric-value">{spec && value !== undefined ? <><span className="sr-only">{spec.label}</span>{formatValue(value, spec)} <span>{spec.unit}</span></> : <span aria-label="Not available">N/A</span>}</td>;
          })}
          <td><StatusIndicator level={assetLevel(asset)} label={asset.state.charAt(0).toUpperCase() + asset.state.slice(1)} /></td>
          <td className="metric-time">{formatClock(asset.lastSeen)}</td>
          {onInjectFault ? <td><button className="fault-button" onClick={() => onInjectFault(asset.spec.id)}>Inject fault</button></td> : null}
        </tr>)}</tbody>
      </table>
      {filtered.length === 0 ? <p className="p-6 text-center text-sm text-hmi-muted">No equipment matches this search.</p> : null}
    </div>
  </section>;
}
