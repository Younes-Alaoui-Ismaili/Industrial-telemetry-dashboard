/**
 * Translation from the telemetry server's wire shapes into the dashboard's
 * domain model.
 *
 * Two rules govern everything in this file.
 *
 * Nothing is invented. The server reports temperature and vibration and nothing
 * else, so a machine seen over MCP shows two metrics, not the five its simulated
 * twin shows. Alarms come from the server's own anomaly detection, carrying the
 * threshold the server itself crossed, rather than being recomputed here against
 * limits the server never agreed to. A device the dashboard has no definition
 * for is still displayed, with no limits at all, because unknown limits are
 * better shown as unknown than guessed.
 *
 * Nothing reads the clock. `now` is passed in, so the alarm lifecycle is exact
 * under test.
 */

import type { Alarm, Asset, AssetSpec, History, MetricKey, MetricSpec } from '../types';
import type { WireAnomaly, WireDevice, WireMetric, WireReading } from '../types/mcp';
import { FLEET } from '../constants/fleet';
import { alarmState } from './alarms';

/** Metric keys the server actually reports, and the wire field each one reads. */
const WIRE_FIELD: Record<WireMetric, keyof Pick<WireDevice, 'temperature_c' | 'vibration_mm_s'>> = {
  temperature: 'temperature_c',
  vibration: 'vibration_mm_s',
};

const SERVER_METRICS: WireMetric[] = ['temperature', 'vibration'];

/**
 * Metric definitions used for a device the dashboard does not know.
 *
 * Units and decimals are properties of the quantity, so they are safe to state.
 * Limits are not: they belong to the machine, and an unknown machine has none
 * here, which keeps every reading rendered as normal rather than judged against
 * an invented number.
 */
const UNKNOWN_METRIC: Record<WireMetric, MetricSpec> = {
  temperature: {
    key: 'temperature',
    label: 'Temp',
    unit: 'C',
    decimals: 1,
    nominal: 0,
    jitter: 0,
  },
  vibration: {
    key: 'vibration',
    label: 'Vibration',
    unit: 'mm/s',
    decimals: 2,
    nominal: 0,
    jitter: 0,
  },
};

/** Dashboard asset definitions, indexed by the id the server uses for them. */
const BY_SOURCE_ID = new Map<string, AssetSpec>(
  FLEET.filter((spec) => spec.sourceId !== undefined).map((spec) => [spec.sourceId as string, spec]),
);

/**
 * The asset definition to render a live device with: the dashboard's own
 * definition when the two projects describe the same machine, trimmed to the
 * metrics the server reports, and a limitless definition otherwise.
 */
export function specForDevice(device: WireDevice): AssetSpec {
  const known = BY_SOURCE_ID.get(device.id);
  if (known) {
    return {
      ...known,
      metrics: known.metrics.filter((metric) =>
        SERVER_METRICS.includes(metric.key as WireMetric),
      ),
    };
  }
  return {
    id: device.id,
    name: device.name,
    kind: 'press',
    sourceId: device.id,
    metrics: SERVER_METRICS.map((metric) => UNKNOWN_METRIC[metric]),
  };
}

/** Dashboard asset id for a server device id. */
export function assetIdFor(deviceId: string): string {
  return BY_SOURCE_ID.get(deviceId)?.id ?? deviceId;
}

/** Server device id for a dashboard asset id, used when sending a command back. */
export function deviceIdFor(assetId: string): string {
  return FLEET.find((spec) => spec.id === assetId)?.sourceId ?? assetId;
}

/** Fault type the server understands for a given metric. */
export function faultTypeFor(metric?: MetricKey): 'overheat' | 'vibration' {
  return metric === 'vibration' ? 'vibration' : 'overheat';
}

export function toAssets(devices: readonly WireDevice[]): Asset[] {
  return devices.map((device) => {
    const spec = specForDevice(device);
    const values: Partial<Record<MetricKey, number>> = {};
    for (const metric of spec.metrics) {
      const field = WIRE_FIELD[metric.key as WireMetric];
      if (field) values[metric.key] = device[field];
    }
    return { spec, state: device.state, values, lastSeen: device.timestamp };
  });
}

/** History keyed the way the charts expect: `${assetId}:${metricKey}`. */
export function toHistory(telemetry: Readonly<Record<string, readonly WireReading[]>>): History {
  const history: History = {};
  for (const [deviceId, readings] of Object.entries(telemetry)) {
    const assetId = assetIdFor(deviceId);
    for (const metric of SERVER_METRICS) {
      const field = WIRE_FIELD[metric];
      history[`${assetId}:${metric}`] = readings.map((reading) => ({
        timestamp: reading.timestamp,
        value: reading[field],
      }));
    }
  }
  return history;
}

function metricSpec(assetId: string, metric: WireMetric): MetricSpec {
  const spec = FLEET.find((asset) => asset.id === assetId);
  return spec?.metrics.find((m) => m.key === metric) ?? UNKNOWN_METRIC[metric];
}

interface Episode {
  key: string;
  assetId: string;
  metric: MetricKey;
  startedAt: number;
  endedAt: number;
  peak: number;
  threshold: number;
}

/**
 * How far apart two reported excursions may sit and still be treated as one.
 *
 * The server re-derives its anomaly list by resampling the queried window on
 * every call, so the boundaries of one continuous fault move by a sample or two
 * between polls. Matching within this tolerance is what keeps a single fault as
 * a single alarm instead of a new row every five seconds. It is the same idea as
 * the deadband a plant puts on an alarm to stop it chattering.
 */
export const EPISODE_MATCH_TOLERANCE_MS = 60_000;

function toEpisode(anomaly: WireAnomaly): Episode {
  const assetId = assetIdFor(anomaly.device_id);
  const metric = anomaly.metric as MetricKey;
  return {
    key: `${assetId}:${metric}`,
    assetId,
    metric,
    startedAt: anomaly.started_at,
    endedAt: anomaly.ended_at,
    peak: anomaly.peak_value,
    threshold: anomaly.threshold,
  };
}

/** True when a reported excursion is the one an existing alarm already tracks. */
function isSameExcursion(alarm: Alarm, episode: Episode): boolean {
  if (`${alarm.assetId}:${alarm.metric}` !== episode.key) return false;
  const alarmEnd = alarm.clearedAt ?? Number.MAX_SAFE_INTEGER;
  return (
    episode.startedAt <= alarmEnd + EPISODE_MATCH_TOLERANCE_MS &&
    episode.endedAt + EPISODE_MATCH_TOLERANCE_MS >= alarm.raisedAt
  );
}

/**
 * Advance the alarm list against the anomalies the server reports.
 *
 * The server owns detection, so an excursion is taken at face value, including
 * the threshold it crossed. The dashboard owns acknowledgement, which the server
 * has no concept of, so that flag lives here and is carried across polls.
 *
 * The hard part is identity. The server has no alarm lifecycle: every call
 * re-scans a sliding window and describes whatever excursions it finds, with
 * identifiers and boundaries that shift as the window moves. So an alarm here is
 * matched to a reported excursion by overlap on the same machine and metric, not
 * by the identifier the server returned. Without that, one continuous fault
 * would raise a fresh alarm on every poll, and a fault that already ended would
 * keep being re-raised for as long as it stayed inside the queried window.
 *
 * The resulting lifecycle is the simulated source's exactly: an alarm absorbs
 * further readings rather than duplicating, an excursion that ends stamps it
 * cleared instead of deleting it, and it leaves the list only once it has both
 * cleared and been acknowledged.
 */
export function toAlarms(
  anomalies: readonly WireAnomaly[],
  previous: readonly Alarm[],
  now: number,
): Alarm[] {
  const next = previous.map((alarm) => ({ ...alarm }));
  const matched = new Set<Alarm>();

  const episodes = anomalies.map(toEpisode).sort((a, b) => a.startedAt - b.startedAt);

  for (const episode of episodes) {
    const clearedAt = episode.endedAt < now ? episode.endedAt : undefined;
    const existing = next.filter((alarm) => !matched.has(alarm) && isSameExcursion(alarm, episode));
    // Most recent first, so a fresh excursion attaches to the newest alarm on
    // that metric rather than to an older one that happens to still overlap.
    const alarm = existing.sort((a, b) => b.raisedAt - a.raisedAt)[0];

    if (alarm) {
      matched.add(alarm);
      alarm.peakValue = Math.max(alarm.peakValue, episode.peak);
      alarm.raisedAt = Math.min(alarm.raisedAt, episode.startedAt);
      alarm.threshold = episode.threshold;
      alarm.clearedAt = clearedAt;
      continue;
    }

    const spec = metricSpec(episode.assetId, episode.metric as WireMetric);
    const raised: Alarm = {
      id: `${episode.key}:${episode.startedAt}`,
      assetId: episode.assetId,
      metric: episode.metric,
      // The server detects against a single threshold, so every excursion it
      // reports is an alarm. It has no warning level to report.
      severity: 'alarm',
      threshold: episode.threshold,
      unit: spec.unit,
      decimals: spec.decimals,
      raisedAt: episode.startedAt,
      peakValue: episode.peak,
      clearedAt,
    };
    next.push(raised);
    // A freshly raised alarm counts as matched: it belongs to the excursion just
    // read, so the sweep below must not immediately clear it.
    matched.add(raised);
  }

  // An alarm still shown as open, for an excursion the server no longer reports,
  // has returned to normal.
  for (const alarm of next) {
    if (alarm.clearedAt === undefined && !matched.has(alarm)) alarm.clearedAt = now;
  }

  return next.filter((alarm) => alarmState(alarm) !== 'cleared');
}
