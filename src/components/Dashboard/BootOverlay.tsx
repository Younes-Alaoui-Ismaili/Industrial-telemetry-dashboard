/**
 * What the visitor sees while the dashboard boots.
 *
 * It has to explain itself. A sober screen that says nothing does not solve the
 * problem the boot work exists to solve: a visitor who does not know that data
 * is coming leaves, and concludes the application is broken. So the overlay
 * states what is running, that it is normal, that readings are on their way, how
 * far along it is, and how long it has been waiting.
 *
 * The steps and the bar are the honest part. Each step is a fact the app has
 * actually established, passed in by the caller, and the bar is clamped to those
 * facts: time moves it inside the segment it is in, never across a boundary. A
 * milestone is crossed by an event, never by the clock.
 *
 * Purely presentational apart from its own elapsed counter, which it owns so
 * that a tick every 100 ms re-renders this overlay alone. Lifted into the hook
 * it would re-render the whole dashboard fifteen times during a boot, delaying
 * the very paint the overlay is waiting on.
 *
 * None of the strings below may collide with the dashboard underneath. The
 * overlay and the dashboard are mounted together, and an exact duplicate of a
 * label such as "Source" would make that label ambiguous both to a screen reader
 * and to any query that looks for it. The source line is therefore one text
 * node, "Data source: Simulated", never a "Source" label with a value beside it.
 */

import { useEffect, useState } from 'react';
import type { DataSourceId } from '../../types/mcp';
import { BOOT_FLOOR_MS } from '../../hooks/useBootPhase';

export interface BootStep {
  label: string;
  done: boolean;
}

interface BootOverlayProps {
  /** Which source the screen is starting on. */
  source: DataSourceId;
  steps: readonly BootStep[];
  /** True during the fade out. */
  leaving: boolean;
  /** False when the visitor asked for no motion: opacity only, no transition. */
  animated: boolean;
}

const SOURCE_LABEL: Record<DataSourceId, string> = {
  simulated: 'Simulated',
  mcp: 'MCP live',
};

const MESSAGE: Record<DataSourceId, string> = {
  simulated: 'Starting the fleet simulator. This is normal; readings appear as soon as it completes.',
  mcp: 'Contacting the telemetry bridge. This is normal; the result is reported either way.',
};

/** How often the elapsed counter refreshes. */
const TICK_MS = 100;

/**
 * How fast the bar may rise on its own, so it starts empty and sweeps up to what
 * is already true instead of appearing part filled. It can understate progress
 * for a moment; it can never overstate it.
 */
const RISE_MS = 500;

/** Fraction of a segment the clock may cover before its milestone lands. */
const SEGMENT_CAP = 0.9;

function useElapsed(): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return elapsed;
}

export function BootOverlay({ source, steps, leaving, animated }: BootOverlayProps) {
  const elapsed = useElapsed();

  const done = steps.filter((step) => step.done).length;
  const share = steps.length > 0 ? 1 / steps.length : 1;
  const complete = steps.length > 0 && done === steps.length;

  const achieved = complete
    ? 1
    : done * share + share * Math.min(SEGMENT_CAP, elapsed / BOOT_FLOOR_MS);
  const progress = Math.min(achieved, elapsed / RISE_MS);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="boot-overlay"
      className={[
        'fixed inset-0 z-50 flex items-center justify-center bg-hmi-page',
        animated ? 'transition-opacity duration-300' : '',
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="w-[340px] border border-hmi-grid bg-hmi-panel p-5">
        {/*
          A div and not a heading: the dashboard header already owns this exact
          name, and a second heading carrying it would duplicate the accessible
          name of the page while both are mounted.
        */}
        <div className="font-mono text-xs font-semibold uppercase tracking-widest text-hmi-primary">
          Industrial Telemetry Dashboard
        </div>
        <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-hmi-muted">
          Data source: {SOURCE_LABEL[source]}
        </p>

        <p className="mt-3 text-xs leading-relaxed text-hmi-secondary">{MESSAGE[source]}</p>

        <ul className="mt-4 space-y-1.5">
          {steps.map((step) => (
            <li key={step.label} className="flex items-center gap-2 text-xs">
              {/*
                State is carried by the square, the ink and the word at the end
                of the row. Never by colour: the palette spends colour on
                abnormal plant states only.
              */}
              <span
                aria-hidden="true"
                className={`inline-block h-1.5 w-1.5 shrink-0 ${
                  step.done ? 'bg-hmi-secondary' : 'border border-hmi-axis'
                }`}
              />
              <span className={step.done ? 'text-hmi-secondary' : 'text-hmi-muted'}>
                {step.label}
              </span>
              <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-hmi-muted">
                {step.done ? 'done' : 'waiting'}
              </span>
            </li>
          ))}
        </ul>

        {/*
          Hidden from assistive technology on purpose. Both of these change many
          times a second, and inside a polite live region that is an announcement
          per tick. The steps above carry the same information at a pace a
          screen reader can actually deliver.
        */}
        <div aria-hidden="true" className="mt-4">
          <div className="h-0.5 w-full bg-hmi-raised">
            <div
              className="h-full bg-hmi-secondary"
              style={{ width: `${Math.round(progress * 100)}%` }}
              data-testid="boot-progress"
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10px] tabular-nums text-hmi-muted">
            <span data-testid="boot-elapsed">{(elapsed / 1000).toFixed(1)} s</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
