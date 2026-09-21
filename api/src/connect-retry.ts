interface Pool { connect(): Promise<unknown>; close(): Promise<unknown> }
function transient(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: string; number?: number; originalError?: unknown; info?: unknown };
  return ['ETIMEOUT', 'ESOCKET', 'ECONNRESET'].includes(value.code ?? '') ||
    [40613, 40197, 40501, 10928, 10929, 49918, 49919, 49920].includes(value.number ?? 0) ||
    transient(value.originalError) || transient(value.info);
}
// Retry only connection establishment, never a transaction or an application write.
export async function connectWithRetry<T extends Pool>(create: () => T,
  sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
): Promise<T> {
  const delays = [5000, 10000, 20000];
  for (let attempt = 0; ; attempt++) {
    const pool = create();
    try { await pool.connect(); return pool; }
    catch (error) {
      await pool.close().catch(() => undefined);
      if (attempt >= delays.length || !transient(error)) throw error;
      console.warn(JSON.stringify({ level: 'warn', code: 'sql_connection_retry', attempt: attempt + 1 }));
      await sleep(delays[attempt]!);
    }
  }
}
