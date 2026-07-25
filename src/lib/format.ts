/**
 * Formatting of numeric readouts.
 *
 * A metric always renders with the same number of decimals so the digit count
 * never changes under the operator's eye, and the unit is kept separate from the
 * value so it can be styled as secondary text rather than competing with it.
 */

/**
 * Takes only the fields it needs, so an alarm (which carries its own unit and
 * precision) can format itself without pretending to be a full metric spec.
 */
export interface Formattable {
  decimals: number;
  unit: string;
}

export function formatValue(value: number, spec: Pick<Formattable, 'decimals'>): string {
  if (spec.decimals === 0) {
    return Math.round(value).toLocaleString('en-US');
  }
  return value.toFixed(spec.decimals);
}

/** Value and unit joined for screen readers and plain text contexts. */
export function formatWithUnit(value: number, spec: Formattable): string {
  const formatted = formatValue(value, spec);
  return spec.unit ? `${formatted} ${spec.unit}` : formatted;
}

/** Clock time only. The date is not useful on a live wall display. */
export function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-GB', { hour12: false });
}
