/**
 * The connect guide for the live source.
 *
 * Opens when the operator picks MCP live and the bridge probe gets no answer.
 * The simulator is the complete default mode of this dashboard; the live source
 * is an option that needs a local install, and this dialog says how to set it
 * up in three lines. It is a setup guide, not a report: nothing here went
 * wrong, so nothing here is worded as if it had.
 *
 * The third step carries a browser truth stated as a condition of use: a page
 * served over https does not reach a local http service, so the live source is
 * used from a local build. No external links, by decision: the companion
 * server's repository is private, and a link that does not resolve would hand
 * the visitor the very impression this dialog exists to prevent.
 */

import { useId, useRef } from 'react';
import { DialogShell } from './DialogShell';

export function ConnectMcpModal({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const primaryRef = useRef<HTMLButtonElement | null>(null);

  return (
    <DialogShell
      onClose={onClose}
      scrimTestId="connect-mcp-scrim"
      labelledBy={titleId}
      dialogClassName="w-full max-w-md"
      initialFocusRef={primaryRef}
    >
      <header className="flex items-start justify-between gap-3 border-b border-hmi-grid px-4 py-3">
        <h2
          id={titleId}
          className="text-xs font-semibold uppercase tracking-widest text-hmi-primary"
        >
          Connect a live MCP source
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="border border-hmi-axis px-2 py-1 text-xs leading-none text-hmi-secondary transition-colors hover:bg-hmi-raised focus:outline-none focus-visible:ring-1 focus-visible:ring-hmi-secondary"
        >
          {'×'}
        </button>
      </header>

      <ol className="list-decimal space-y-2 py-4 pl-9 pr-4 text-xs leading-relaxed text-hmi-primary">
        <li>Run a telemetry MCP server on your machine.</li>
        <li>Start the bridge with the server path in its environment variable.</li>
        <li>Open this dashboard from a local build, then switch the source to MCP live.</li>
      </ol>

      <footer className="flex justify-end border-t border-hmi-grid px-4 py-3">
        <button
          ref={primaryRef}
          type="button"
          onClick={onClose}
          className="border border-hmi-axis px-3 py-1.5 text-xs uppercase tracking-wider text-hmi-primary transition-colors hover:bg-hmi-raised focus:outline-none focus-visible:ring-1 focus-visible:ring-hmi-secondary"
        >
          Stay in simulated mode
        </button>
      </footer>
    </DialogShell>
  );
}
