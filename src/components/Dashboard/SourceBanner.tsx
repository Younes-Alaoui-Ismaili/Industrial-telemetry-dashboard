/**
 * The honest degradation notice.
 *
 * When the live source is selected but not reachable, the screen keeps working
 * on the simulator, and this banner is what makes that substitution impossible
 * to miss: it says the server is unavailable, it repeats the reason the bridge
 * or the browser actually gave, and it states in words that what is on screen is
 * simulated. Falling back quietly would turn a demo into a claim that is not
 * true, which is the one outcome this feature is built to prevent.
 */

import type { McpConnection } from '../../types/mcp';

interface SourceBannerProps {
  connection: McpConnection;
}

export function SourceBanner({ connection }: SourceBannerProps) {
  if (connection.status === 'live' || connection.status === 'idle') return null;

  const connecting = connection.status === 'connecting';

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-hmi-grid bg-hmi-panel"
      data-testid="source-banner"
    >
      <div className="mx-auto flex max-w-[1600px] items-start gap-3 px-4 py-2">
        <span
          aria-hidden="true"
          className={`mt-0.5 inline-block h-3 w-3 shrink-0 ${
            connecting ? 'bg-hmi-muted' : 'bg-hmi-warning'
          }`}
        />
        <p className="text-xs leading-relaxed text-hmi-primary">
          <span className="font-semibold uppercase tracking-wide">
            {connecting ? 'Connecting to MCP server' : 'MCP server unavailable'}
          </span>
          {connecting ? (
            <> Waiting for the local bridge to answer.</>
          ) : (
            <>
              {' '}
              Showing <strong>simulated</strong> data, not live readings.
              {connection.detail ? (
                <>
                  {' '}
                  Reason: <span className="font-mono text-hmi-secondary">{connection.detail}</span>
                </>
              ) : null}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
