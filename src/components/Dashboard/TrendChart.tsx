/**
 * Full trend for one metric, with its operating limits drawn on the plot.
 *
 * The limits are the point: a bare curve tells you a number moved, a curve with
 * its warning and alarm lines tells you whether that matters. The band above the
 * alarm limit is shaded so an excursion reads before any label is parsed.
 */

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MetricSpec, Sample } from '../../types';
import { ink, line, neutralTrace, status, surface } from '../../constants/theme';
import { evaluate } from '../../lib/thresholds';
import { formatClock, formatValue } from '../../lib/format';

interface TrendChartProps {
  assetId: string;
  spec: MetricSpec;
  samples: readonly Sample[];
}

export function TrendChart({ assetId, spec, samples }: TrendChartProps) {
  const latest = samples.length > 0 ? samples[samples.length - 1].value : spec.nominal;
  const level = evaluate(latest, spec);
  const stroke =
    level === 'alarm' ? status.alarm : level === 'warning' ? status.warning : neutralTrace;

  const values = samples.map((s) => s.value);
  const limits = [spec.warn, spec.alarm].filter((v): v is number => v !== undefined);
  const lowest = Math.min(...values, ...limits, spec.nominal);
  const highest = Math.max(...values, ...limits, spec.nominal);
  const pad = (highest - lowest) * 0.12 || 1;

  const data = samples.map((s) => ({ t: s.timestamp, v: s.value }));

  return (
    <section
      className="border border-hmi-grid bg-hmi-panel p-3"
      aria-label={`${assetId} ${spec.label} trend`}
    >
      <header className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-hmi-secondary">
          {assetId} <span className="text-hmi-muted">{spec.label}</span>
        </h3>
        <span className="font-mono text-xs tabular-nums text-hmi-muted">
          {spec.warn !== undefined ? `warn ${formatValue(spec.warn, spec)}` : null}
          {spec.alarm !== undefined ? ` / alarm ${formatValue(spec.alarm, spec)}` : null}
          {spec.unit ? ` ${spec.unit}` : null}
        </span>
      </header>

      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={line.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={formatClock}
              stroke={line.axis}
              tick={{ fill: ink.muted, fontSize: 10 }}
              minTickGap={48}
            />
            <YAxis
              domain={[lowest - pad, highest + pad]}
              stroke={line.axis}
              tick={{ fill: ink.muted, fontSize: 10 }}
              tickFormatter={(v: number) => formatValue(v, spec)}
              width={46}
            />

            {spec.alarm !== undefined ? (
              <ReferenceArea
                y1={spec.alarm}
                y2={highest + pad}
                fill={status.alarm}
                fillOpacity={0.12}
                strokeOpacity={0}
              />
            ) : null}
            {spec.warn !== undefined ? (
              <ReferenceLine y={spec.warn} stroke={status.warning} strokeDasharray="4 4" />
            ) : null}
            {spec.alarm !== undefined ? (
              <ReferenceLine y={spec.alarm} stroke={status.alarm} strokeDasharray="4 4" />
            ) : null}

            <Tooltip
              contentStyle={{
                background: surface.raised,
                border: `1px solid ${line.axis}`,
                borderRadius: 0,
                color: ink.primary,
                fontSize: 12,
              }}
              labelFormatter={(t: number) => formatClock(t)}
              formatter={(v: number) => [`${formatValue(v, spec)} ${spec.unit}`.trim(), spec.label]}
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke={stroke}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
