import { useState } from 'react';
import type { McpConnection } from '../../types/mcp';
import type { OperationalReport } from '../../hooks/useCloudData';

export function CloudSourcePanel({ connection, deployment, isOperator, report, onToken }: {
  connection: McpConnection; deployment: string; isOperator: boolean; report: OperationalReport | null; onToken: (token: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const seconds = (value: number | null | undefined) => value == null ? 'No completed observations' : (value / 1000).toFixed(1) + ' s';
  return <section aria-label="Cloud connection" className="m-4 border border-hmi-grid bg-hmi-panel p-4 text-sm">
    <p role="status">{connection.status === 'live' ? 'Connected to ' + (deployment === 'azure' ? 'Azure' : 'local API') + '. Simulated measurements. Access: ' + (isOperator ? 'Operator' : 'Reader') + '.' : connection.detail ?? 'Connecting to the API...'}</p>
    {connection.status !== 'live' ? <form className="mt-2 flex flex-wrap gap-3" onSubmit={event => { event.preventDefault(); onToken(draft); setDraft(''); }}>
      <a href="/.auth/login/aad?post_login_redirect_uri=/?source=cloud" className="underline">Sign in with Microsoft</a>
      <label>Local access token <input type="password" autoComplete="off" value={draft} onChange={event => setDraft(event.target.value)} className="border border-hmi-grid bg-hmi-page p-1" /></label>
      <button type="submit" className="border border-hmi-grid px-3">Connect locally</button>
    </form> : null}
    {report ? <dl className="mt-3 flex flex-wrap gap-6">
      <div><dt>Alarms raised, last 15 minutes</dt><dd>{report.alarm_count}</dd></div>
      <div><dt>Mean acknowledgement delay</dt><dd>{seconds(report.average_acknowledgement_ms)}</dd></div>
      <div><dt>Mean completed exceedance duration</dt><dd>{seconds(report.average_cleared_duration_ms)}</dd></div>
    </dl> : null}
  </section>;
}
