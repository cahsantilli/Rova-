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
}

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
  };
}
