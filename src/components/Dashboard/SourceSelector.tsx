/**
 * Data source selector.
 *
 * Two real radio inputs in a labelled group rather than a pair of styled divs,
 * so the control is reachable by keyboard and announced as a choice. The visual
 * treatment follows the rest of the screen: the selection is carried by a raised
 * surface and a written state, never by colour alone.
 */

import type { DataSourceId } from '../../types/mcp';

const OPTIONS: { id: DataSourceId; label: string; hint: string }[] = [
  { id: 'simulated', label: 'Simulated', hint: 'Built in simulator, no setup required' },
  { id: 'mcp', label: 'MCP live', hint: 'Live readings from a telemetry MCP server' },
];

interface SourceSelectorProps {
  value: DataSourceId;
  /**
   * The control that asked for the change travels with the choice, so the
   * caller can hand focus back to it if the change opens a dialog instead of
   * switching.
   */
  onChange: (value: DataSourceId, control: HTMLInputElement) => void;
}

export function SourceSelector({ value, onChange }: SourceSelectorProps) {
  return (
    <fieldset className="flex flex-col gap-0.5">
      <legend className="text-[10px] uppercase tracking-wider text-hmi-muted">Data source</legend>
      <div className="flex border border-hmi-grid">
        {OPTIONS.map((option) => {
          const selected = option.id === value;
          return (
            <label
              key={option.id}
              title={option.hint}
              className="cursor-pointer border-r border-hmi-grid last:border-r-0"
            >
              <input
                type="radio"
                name="data-source"
                value={option.id}
                checked={selected}
                onChange={(event) => onChange(option.id, event.currentTarget)}
                className="peer sr-only"
              />
              <span
                className={`block px-3 py-1 font-mono text-xs uppercase tracking-wide peer-focus-visible:ring-1 peer-focus-visible:ring-hmi-secondary ${
                  selected ? 'bg-hmi-raised text-hmi-primary' : 'text-hmi-secondary'
                }`}
              >
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
