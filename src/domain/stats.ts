import { addDays, type Dataset } from "./parse";
import type { FieldKey } from "./schema";

export interface Point {
  date: string;
  /** null = no reading that day (missing cell or no row). */
  value: number | null;
}

export interface FieldSummary {
  field: FieldKey;
  series: Point[];
  available: number;
  missingDates: string[];
  latest: Point | null;
  /** True when the most recent day in the file has no reading for this field. */
  latestIsStale: boolean;
  periodAvg: number | null;
  periodMin: Point | null;
  periodMax: Point | null;
  recentWindowDays: number;
  recentAvg: number | null;
  recentAvailable: number;
  /** recentAvg - periodAvg */
  recentDelta: number | null;
  /** Where most of this person's days fall: period average ± one standard deviation. */
  usual: { low: number; high: number } | null;
  /** How the recent average sits against the usual range. */
  status: UsualStatus;
}

export type UsualStatus = "within" | "above" | "below" | "unknown";

/** Fewer readings than this and "usual" isn't meaningful. */
export const MIN_READINGS_FOR_USUAL = 7;

export const RECENT_WINDOW_DAYS = 7;

/** One point per calendar day from first to last date, so gaps stay visible. */
export function seriesFor(ds: Dataset, field: FieldKey): Point[] {
  const byDate = new Map(ds.days.map((d) => [d.date, d]));
  const out: Point[] = [];
  for (let dt = ds.firstDate; dt <= ds.lastDate; dt = addDays(dt, 1)) {
    const cell = byDate.get(dt)?.values[field] ?? null;
    out.push({ date: dt, value: cell ? cell.value : null });
  }
  return out;
}

function stdDev(values: number[]): number {
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / (values.length - 1));
}

function mean(points: Point[]): number | null {
  const vals = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function summarize(ds: Dataset, field: FieldKey, windowDays = RECENT_WINDOW_DAYS): FieldSummary {
  const series = seriesFor(ds, field);
  const withValue = series.filter((p) => p.value !== null);
  const recent = series.slice(-windowDays);
  const periodAvg = mean(series);
  const recentAvg = mean(recent);
  let min: Point | null = null;
  let max: Point | null = null;
  for (const p of withValue) {
    if (!min || p.value! < min.value!) min = p;
    if (!max || p.value! > max.value!) max = p;
  }
  const latest = withValue.length ? withValue[withValue.length - 1] : null;
  let usual: FieldSummary["usual"] = null;
  if (periodAvg !== null && withValue.length >= MIN_READINGS_FOR_USUAL) {
    const sd = stdDev(withValue.map((p) => p.value!));
    usual = { low: periodAvg - sd, high: periodAvg + sd };
  }
  let status: UsualStatus = "unknown";
  if (usual && recentAvg !== null) {
    status = recentAvg > usual.high ? "above" : recentAvg < usual.low ? "below" : "within";
  }
  return {
    field,
    series,
    available: withValue.length,
    missingDates: series.filter((p) => p.value === null).map((p) => p.date),
    latest,
    latestIsStale: latest !== null && latest.date !== ds.lastDate,
    periodAvg,
    periodMin: min,
    periodMax: max,
    recentWindowDays: recent.length,
    recentAvg,
    recentAvailable: recent.filter((p) => p.value !== null).length,
    recentDelta: recentAvg !== null && periodAvg !== null ? recentAvg - periodAvg : null,
    usual,
    status,
  };
}
