/**
 * Micro trend for an asset tile.
 *
 * Hand drawn SVG rather than a chart component: eight tiles each re-rendering a
 * full chart library on every tick is a lot of work for a sixty pixel trace, and
 * this keeps the mark thin and the colour under our control.
 *
 * The trace is neutral while the reading is inside its limits, and only takes a
 * status colour once it is not.
 */

import type { MetricLevel, Sample } from '../../types';
import { neutralTrace, status } from '../../constants/theme';

interface SparklineProps {
  samples: readonly Sample[];
  level: MetricLevel;
  width?: number;
  height?: number;
}

export function Sparkline({ samples, level, width = 96, height = 24 }: SparklineProps) {
  if (samples.length < 2) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }

  const values = samples.map((s) => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (samples.length - 1);

  const points = values
    .map((value, i) => {
      const x = i * step;
      // Inset by one pixel top and bottom so the stroke is never clipped.
      const y = height - 1 - ((value - min) / span) * (height - 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const stroke =
    level === 'alarm' ? status.alarm : level === 'warning' ? status.warning : neutralTrace;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
