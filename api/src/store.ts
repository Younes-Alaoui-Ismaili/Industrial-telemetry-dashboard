import sql from 'mssql';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DomainError, type AlarmRecord, type Device, type Measurement, type TelemetryStore } from './types.js';

type Scope = sql.ConnectionPool | sql.Transaction;
type Row = Record<string, unknown>;
const numeric = new Set(['timestamp', 'raised_at', 'last_seen_at', 'cleared_at', 'acknowledged_at', 'started_at', 'ended_at']);
function normal<T>(row: Row): T {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, numeric.has(key) && value !== null ? Number(value) : value])) as T;
}
async function query<T = Row>(scope: Scope, statement: string, parameters: Row = {}): Promise<T[]> {
  const request = scope instanceof sql.Transaction ? new sql.Request(scope) : new sql.Request(scope);
  for (const [key, value] of Object.entries(parameters)) {
    if (typeof value === 'number') request.input(key, Number.isInteger(value) ? sql.BigInt : sql.Float, value);
    else request.input(key, sql.NVarChar(sql.MAX), value == null ? null : String(value));
  }
  return (await request.query(statement)).recordset?.map(row => normal<T>(row)) ?? [];
}
const columns: Record<string, string[]> = {
  devices: ['id', 'name', 'temperature_limit', 'vibration_limit'],
  events: ['event_id', 'device_id', 'timestamp', 'temperature_c', 'vibration_mm_s', 'state', 'provenance', 'payload_hash'],
  alarms: ['id', 'device_id', 'metric', 'threshold', 'raised_at', 'last_seen_at', 'peak_value', 'cleared_at', 'acknowledged_at', 'acknowledged_by'],
  audit: ['id', 'actor', 'timestamp', 'action', 'resource_id', 'details'],
};
export interface Backup { version: 1; created_at: string; data: Record<string, Row[]>; sha256: string }
function hash(value: unknown) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export class SqlStore implements TelemetryStore {
  private constructor(private pool: sql.ConnectionPool) {}
  static async connect(connection: string | sql.config) {
    const pool = new sql.ConnectionPool(connection);
    pool.on('error', () => console.warn(JSON.stringify({ level: 'warn', code: 'sql_pool_error', message: 'SQL connection unavailable' })));
    await pool.connect();
    return new SqlStore(pool);
  }
  async close() { await this.pool.close(); }
  async health() { await query(this.pool, 'SELECT 1 AS ready'); }
  async migrate() { await this.pool.request().batch(await readFile(resolve('migrations/001-initial.sql'), 'utf8')); }
  private async transaction<T>(work: (tx: sql.Transaction) => Promise<T>): Promise<T> {
    const tx = new sql.Transaction(this.pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try { const result = await work(tx); await tx.commit(); return result; }
    catch (error) {
      await tx.rollback().catch(() => undefined);
      if (error instanceof sql.RequestError && [2601, 2627].includes(error.number ?? 0)) throw new DomainError(409, 'measurement_conflict');
      throw error;
    }
  }
  private async audit(scope: Scope, actor: string, action: string, resource: string, details: object) {
    await query(scope, 'INSERT dbo.audit(id,actor,timestamp,action,resource_id,details) VALUES(@id,@actor,@at,@action,@resource,@details)', {
      id: randomUUID(), actor, at: Date.now(), action, resource, details: JSON.stringify(details),
    });
  }
  async registerDevice(device: Device, actor: string): Promise<Device> {
    return this.transaction(async tx => {
      const [old] = await query<Device>(tx, 'SELECT * FROM dbo.devices WITH (UPDLOCK,HOLDLOCK) WHERE id=@id', { id: device.id });
      if (old) {
        if (old.name !== device.name || old.temperature_limit !== device.temperature_limit || old.vibration_limit !== device.vibration_limit) throw new DomainError(409, 'device_configuration_conflict');
        return old;
      }
      await query(tx, 'INSERT dbo.devices(id,name,temperature_limit,vibration_limit) VALUES(@id,@name,@temperature_limit,@vibration_limit)', { ...device });
      await this.audit(tx, actor, 'device_registered', device.id, { provenance: 'simulated' });
      return device;
    });
  }
  async devices() {
    return query(this.pool, `SELECT d.*,e.timestamp,e.temperature_c,e.vibration_mm_s,e.state,e.provenance
      FROM dbo.devices d OUTER APPLY (SELECT TOP(1) * FROM dbo.events WHERE device_id=d.id ORDER BY timestamp DESC) e
      WHERE e.event_id IS NOT NULL ORDER BY d.id`);
  }
  async telemetry(device: string, start: number, end: number) {
    if (!(await query(this.pool, 'SELECT id FROM dbo.devices WHERE id=@id', { id: device })).length) throw new DomainError(404, 'device_not_found');
    const rows = await query(this.pool, 'SELECT TOP(10001) event_id,timestamp,temperature_c,vibration_mm_s,state,provenance FROM dbo.events WHERE device_id=@device AND timestamp>=@start AND timestamp<=@end ORDER BY timestamp', { device, start, end });
    if (rows.length > 10000) throw new DomainError(413, 'narrow_time_range');
    return rows;
  }
  async alarms(device?: string): Promise<AlarmRecord[]> {
    return query<AlarmRecord>(this.pool, 'SELECT TOP(1000) * FROM dbo.alarms WHERE (@device IS NULL OR device_id=@device) ORDER BY raised_at DESC,id', { device });
  }
  async anomalies(device: string | undefined, start: number, end: number) {
    return query(this.pool, `SELECT TOP(1000) a.id,a.device_id,a.metric,a.threshold,CASE WHEN a.metric='temperature' THEN s.peak_temperature ELSE s.peak_vibration END AS peak_value,s.started_at,s.ended_at,s.sample_count
      FROM dbo.alarms a CROSS APPLY (
        SELECT MIN(e.timestamp) AS started_at,MAX(e.timestamp) AS ended_at,COUNT(*) AS sample_count,
          MAX(e.temperature_c) AS peak_temperature,MAX(e.vibration_mm_s) AS peak_vibration
        FROM dbo.events e WHERE e.device_id=a.device_id AND e.timestamp>=a.raised_at AND e.timestamp<=a.last_seen_at
          AND e.timestamp>=@start AND e.timestamp<=@end
      ) s WHERE (@device IS NULL OR a.device_id=@device) AND a.raised_at<=@end AND a.last_seen_at>=@start
        AND s.sample_count>0 ORDER BY a.raised_at,a.id`, { device, start, end });
  }
  async ingest(events: Measurement[], actor: string) {
    return this.transaction(async tx => {
      let accepted = 0;
      let duplicates = 0;
      const ordered = [...events].sort((a, b) => a.device_id.localeCompare(b.device_id) || a.timestamp - b.timestamp);
      for (const event of ordered) {
        const [device] = await query<Device>(tx, 'SELECT * FROM dbo.devices WITH (UPDLOCK,HOLDLOCK) WHERE id=@id', { id: event.device_id });
        if (!device) throw new DomainError(404, 'device_not_registered');
        const fingerprint = hash([event.device_id, event.timestamp, event.temperature_c, event.vibration_mm_s, event.state, event.provenance]);
        const [old] = await query<{ payload_hash: string }>(tx, 'SELECT payload_hash FROM dbo.events WITH (UPDLOCK,HOLDLOCK) WHERE event_id=@id', { id: event.event_id });
        if (old) {
          if (old.payload_hash !== fingerprint) throw new DomainError(409, 'event_payload_conflict');
          duplicates++;
          continue;
        }
        const [latest] = await query<{ timestamp: number }>(tx, 'SELECT TOP(1) timestamp FROM dbo.events WHERE device_id=@id ORDER BY timestamp DESC', { id: event.device_id });
        if (latest && event.timestamp <= latest.timestamp) throw new DomainError(409, 'event_order_conflict');
        if (event.timestamp > Date.now() + 30000) throw new DomainError(400, 'future_measurement');
        await query(tx, 'INSERT dbo.events(event_id,device_id,timestamp,temperature_c,vibration_mm_s,state,provenance,payload_hash) VALUES(@event_id,@device_id,@timestamp,@temperature_c,@vibration_mm_s,@state,@provenance,@payload_hash)', { ...event, payload_hash: fingerprint });
        for (const [metric, value, limit] of [
          ['temperature', event.temperature_c, device.temperature_limit],
          ['vibration', event.vibration_mm_s, device.vibration_limit],
        ] as const) {
          const [active] = await query<AlarmRecord>(tx, 'SELECT * FROM dbo.alarms WITH (UPDLOCK,HOLDLOCK) WHERE device_id=@device AND metric=@metric AND cleared_at IS NULL', { device: event.device_id, metric });
          if (value > limit) {
            if (active) {
              await query(tx, 'UPDATE dbo.alarms SET last_seen_at=@at,peak_value=CASE WHEN peak_value<@value THEN @value ELSE peak_value END WHERE id=@id', { at: event.timestamp, value, id: active.id });
            } else {
              const id = randomUUID();
              await query(tx, 'INSERT dbo.alarms(id,device_id,metric,threshold,raised_at,last_seen_at,peak_value) VALUES(@id,@device,@metric,@limit,@at,@at,@value)', { id, device: event.device_id, metric, limit, at: event.timestamp, value });
              await this.audit(tx, actor, 'alarm_raised', id, { event_id: event.event_id });
            }
          } else if (active) {
            await query(tx, 'UPDATE dbo.alarms SET cleared_at=@at WHERE id=@id', { at: event.timestamp, id: active.id });
            await this.audit(tx, actor, 'alarm_cleared', active.id, { event_id: event.event_id });
          }
        }
        accepted++;
      }
      return { accepted, duplicates };
    });
  }
  async acknowledge(id: string, actor: string) {
    return this.transaction(async tx => {
      const [alarm] = await query<AlarmRecord>(tx, 'SELECT * FROM dbo.alarms WITH (UPDLOCK,HOLDLOCK) WHERE id=@id', { id });
      if (!alarm) throw new DomainError(404, 'alarm_not_found');
      if (alarm.acknowledged_at === null) {
        const at = Date.now();
        await query(tx, 'UPDATE dbo.alarms SET acknowledged_at=@at,acknowledged_by=@actor WHERE id=@id', { id, at, actor });
        await this.audit(tx, actor, 'alarm_acknowledged', id, {});
        return { ...alarm, acknowledged_at: at, acknowledged_by: actor };
      }
      return alarm;
    });
  }
  async report(start: number, end: number) {
    const [result] = await query(this.pool, `SELECT COUNT(*) AS alarm_count,COUNT(acknowledged_at) AS acknowledged_count,
      AVG(CASE WHEN acknowledged_at IS NOT NULL THEN CAST(acknowledged_at-raised_at AS float) END) AS average_acknowledgement_ms,
      COUNT(cleared_at) AS cleared_count,
      AVG(CASE WHEN cleared_at IS NOT NULL THEN CAST(cleared_at-raised_at AS float) END) AS average_cleared_duration_ms
      FROM dbo.alarms WHERE raised_at>=@start AND raised_at<=@end`, { start, end });
    return { ...result, basis: 'alarms raised in the selected window; unacknowledged and open durations excluded from averages', units: 'milliseconds', provenance: 'simulated' };
  }
  async exportData(): Promise<Backup> {
    return this.transaction(async tx => {
      const data: Record<string, Row[]> = {};
      for (const table of Object.keys(columns)) data[table] = await query(tx, 'SELECT * FROM dbo.' + table + ' ORDER BY ' + columns[table][0]);
      return { version: 1, created_at: new Date().toISOString(), data, sha256: hash(data) };
    });
  }
  async importData(backup: Backup) {
    if (backup.version !== 1 || !backup.data || backup.sha256 !== hash(backup.data)) throw new DomainError(400, 'backup_checksum_mismatch');
    if (Object.keys(backup.data).sort().join(',') !== Object.keys(columns).sort().join(',')) throw new DomainError(400, 'backup_tables_invalid');
    for (const [table, fields] of Object.entries(columns)) {
      if (!Array.isArray(backup.data[table]) || backup.data[table].length > 100000) throw new DomainError(400, 'backup_table_invalid');
      for (const row of backup.data[table]) if (!row || Object.keys(row).sort().join(',') !== [...fields].sort().join(',')) throw new DomainError(400, 'backup_row_invalid');
    }
    return this.transaction(async tx => {
      for (const table of Object.keys(columns)) if ((await query(tx, 'SELECT TOP(1) 1 AS occupied FROM dbo.' + table)).length) throw new DomainError(409, 'restore_requires_empty_database');
      for (const [table, fields] of Object.entries(columns)) {
        const statement = 'INSERT dbo.' + table + '(' + fields.join(',') + ') VALUES(' + fields.map(f => '@' + f).join(',') + ')';
        for (const row of backup.data[table]) await query(tx, statement, row);
      }
      return { imported: Object.fromEntries(Object.entries(backup.data).map(([table, rows]) => [table, rows.length])) };
    });
  }
}
