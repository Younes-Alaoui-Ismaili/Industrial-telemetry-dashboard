/**
 * The honest degradation notice.
 *
 * When a live session loses its bridge, the screen keeps working on the
 * simulator, and this banner is what makes that substitution impossible to
 * miss: it names the lost link and states in words that what is on screen is
 * simulated. Falling back quietly would turn a demo into a claim that is not
 * true, which is the one outcome this feature is built to prevent.
 *
 * The connection's raw detail string is deliberately not rendered: it comes
 * from the browser or the bridge and is worded as a defect report, which a
 * lost optional link is not. It stays in the connection state for anyone
 * reading it from code.
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
            {connecting ? 'Connecting to MCP server' : 'MCP link lost'}
          </span>
          {connecting ? (
            <> Waiting for the local bridge to answer.</>
          ) : (
            <>
              {' '}
              Showing <strong>simulated</strong> data, not live readings. The dashboard keeps
              polling and switches back when the bridge answers.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
