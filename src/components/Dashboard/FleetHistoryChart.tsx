import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Asset, History } from '../../types';
import { ink, line, surface } from '../../constants/theme';
import { formatClock } from '../../lib/format';

const colors = ['#bd3030', '#216aab', '#397847', '#925b12', '#714db5', '#0b797c', '#7b5261', '#485568'];

export function FleetHistoryChart({ assets, history, metric }: { assets: readonly Asset[]; history: History; metric: 'temperature' | 'vibration' }) {
  const title = metric === 'temperature' ? 'Temperature history' : 'Vibration history';
  const unit = metric === 'temperature' ? '°C' : 'mm/s';
  const series = assets.filter(a => a.spec.metrics.some(m => m.key === metric));
  const data = useMemo(() => {
    const rows = new Map<number, Record<string, number>>();
    for (const asset of assets) for (const sample of history[`${asset.spec.id}:${metric}`] ?? []) {
      const row = rows.get(sample.timestamp) ?? { timestamp: sample.timestamp };
      row[asset.spec.id] = sample.value;
      rows.set(sample.timestamp, row);
    }
    return [...rows.values()].sort((a, b) => a.timestamp - b.timestamp);
  }, [assets, history, metric]);
  return <section className="industrial-panel history-panel" aria-label={`${title} trend`}>
    <header className="panel-heading"><div><h2>{title} <span className="text-hmi-muted">({unit})</span></h2><p>Rolling history · All equipment</p></div></header>
    <div className="fleet-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={line.grid} strokeDasharray="3 3" />
          <XAxis dataKey="timestamp" type="number" domain={['dataMin', 'dataMax']} tickFormatter={formatClock} minTickGap={55} tick={{ fill: ink.muted, fontSize: 11 }} stroke={line.axis} />
          <YAxis width={48} tick={{ fill: ink.muted, fontSize: 11 }} stroke={line.axis} domain={['auto', 'auto']} />
          <Tooltip labelFormatter={v => formatClock(Number(v))} formatter={(v: number, name: string) => [`${v.toFixed(metric === 'temperature' ? 1 : 2)} ${unit}`, name]} contentStyle={{ background: surface.panel, border: `1px solid ${line.axis}`, borderRadius: 8, fontSize: 12 }} />
          {series.map((asset, i) => <Line key={asset.spec.id} name={asset.spec.id} dataKey={asset.spec.id} stroke={colors[i % colors.length]} strokeWidth={2} strokeDasharray={i >= 4 ? '6 3' : undefined} dot={false} connectNulls={true} isAnimationActive={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="history-summary"><table aria-label={`${title} statistics`}><thead><tr><th>Equipment</th><th>Min</th><th>Max</th><th>Latest</th></tr></thead><tbody>
      {series.map((asset, i) => {
        const values = (history[`${asset.spec.id}:${metric}`] ?? []).map(s => s.value);
        const print = (n: number) => `${n.toFixed(metric === 'temperature' ? 1 : 2)} ${unit}`;
        return <tr key={asset.spec.id}><th scope="row"><span style={{ backgroundColor: colors[i % colors.length] }} aria-hidden="true" />{asset.spec.id}</th><td>{values.length ? print(Math.min(...values)) : 'N/A'}</td><td>{values.length ? print(Math.max(...values)) : 'N/A'}</td><td>{values.length ? print(values[values.length - 1]) : 'N/A'}</td></tr>;
      })}
    </tbody></table></div>
  </section>;
}
