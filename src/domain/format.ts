import { FIELDS, type FieldKey } from "./schema";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d, wd: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/** "Aug 14" */
export function shortDate(iso: string): string {
  const { m, d } = parts(iso);
  return `${MONTHS[m - 1]} ${d}`;
}

/** "Fri, Aug 14" */
export function dayDate(iso: string): string {
  const { m, d, wd } = parts(iso);
  return `${WEEKDAYS[wd]}, ${MONTHS[m - 1]} ${d}`;
}

/** "Aug 1 – Aug 30, 2026" */
export function rangeLabel(first: string, last: string): string {
  return `${shortDate(first)} – ${shortDate(last)}, ${parts(last).y}`;
}

/** Number only, using the field's precision. `extra` adds decimals for averages. */
export function formatNumber(field: FieldKey, value: number, extra = 0): string {
  const spec = FIELDS[field];
  const dec = spec.decimals + extra;
  let s = value.toFixed(dec);
  if (Number(s) === 0) s = (0).toFixed(dec); // never show "-0.0"
  if (spec.signed && Number(s) > 0) s = `+${s}`;
  return s;
}

export function formatValue(field: FieldKey, value: number | null | undefined, extra = 0): string {
  if (value === null || value === undefined) return "No data";
  const unit = FIELDS[field].unit;
  return unit ? `${formatNumber(field, value, extra)} ${unit}` : formatNumber(field, value, extra);
}

/** Difference between two averages, always signed, e.g. "−0.4 h". */
export function formatDelta(field: FieldKey, delta: number, extra = 1): string {
  const spec = FIELDS[field];
  const dec = spec.decimals + extra;
  const abs = Math.abs(delta).toFixed(dec);
  if (Number(abs) === 0) return `no difference`;
  const sign = delta > 0 ? "+" : "−";
  return spec.unit ? `${sign}${abs} ${spec.unit}` : `${sign}${abs}`;
}
