/**
 * What the visitor sees while the dashboard boots.
 *
 * The steps are the honest part. Each one is a fact the app has actually
 * established, passed in by the caller, so the list advances because something
 * happened and not because a timer told it to. The bar at the bottom is that
 * same list counted, never a schedule: a bar that fills on a timer is a
 * decoration pretending to be a measurement, and this is a supervision screen.
 *
 * Purely presentational. Timing lives in useBootPhase, so this file can be read
 * and tested as markup.
 *
 * None of the strings below may collide with the dashboard underneath. The
 * overlay and the dashboard are mounted together for a moment, and an exact
 * duplicate of a label such as "Source" would make that label ambiguous both to
 * a screen reader and to any query that looks for it. The source line is
 * therefore one text node, "Data source: Simulated", never a "Source" label with
 * a value beside it.
 */

import type { DataSourceId } from '../../types/mcp';

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

export function BootOverlay({ source, steps, leaving, animated }: BootOverlayProps) {
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
      <div className="w-[300px] border border-hmi-grid bg-hmi-panel p-5">
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

        <div className="mt-4 h-0.5 w-full bg-hmi-raised">
          <div
            className="h-full bg-hmi-secondary"
            style={{
              width: `${(steps.filter((s) => s.done).length / Math.max(steps.length, 1)) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
