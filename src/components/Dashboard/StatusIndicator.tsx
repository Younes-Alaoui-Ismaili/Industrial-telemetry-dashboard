/**
 * State chip.
 *
 * State is carried by three channels at once: a written label, a shape, and a
 * colour. Colour is never the only one, which matters for colour vision
 * deficiency, for a washed out panel in daylight, and for print.
 */

import type { MetricLevel } from '../../types';

interface StatusIndicatorProps {
  level: MetricLevel;
  label: string;
}

const glyph: Record<MetricLevel, string> = {
  normal: '●', // filled circle
  warning: '▲', // triangle
  alarm: '■', // square
};

const tone: Record<MetricLevel, string> = {
  normal: 'text-hmi-muted',
  warning: 'text-hmi-warning',
  alarm: 'text-hmi-alarm',
};

export function StatusIndicator({ level, label }: StatusIndicatorProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`text-[10px] leading-none ${tone[level]}`}>
        {glyph[level]}
      </span>
      <span className="text-xs uppercase tracking-wide text-hmi-secondary">{label}</span>
    </span>
  );
}
