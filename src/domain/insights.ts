// What the overview says beyond "how am I doing": what changed this week and what moved together.
// Deterministic restatements of the person's own numbers. No interpretation, no advice.

import type { Dataset } from "./parse";
import { FIELDS, METRICS, type FieldKey, type MetricSpec } from "./schema";
import { summarize, type FieldSummary } from "./stats";
import { coMovingStretches, lowerLabel, type Stretch } from "./patterns";

export interface Change {
  metric: MetricSpec;
  summary: FieldSummary;
  /** Last 7 days minus the 30-day average, in standard deviations. 0 when unknown. */
  shift: number;
  /** Plain words, e.g. "a little higher than your monthly average". */
  words: string;
}

function sd(s: FieldSummary): number | null {
  return s.usual ? (s.usual.high - s.usual.low) / 2 : null;
}

function shiftWords(shift: number, status: FieldSummary["status"]): string {
  if (status === "above") return "above your usual range";
  if (status === "below") return "below your usual range";
  const a = Math.abs(shift);
  if (a < 0.2) return "about the same as your monthly average";
  const dir = shift > 0 ? "higher" : "lower";
  return a < 0.6 ? `a little ${dir} than your monthly average` : `${dir} than your monthly average`;
}

/** Every metric, ordered by how far its last 7 days moved from its own month. */
export function weekChanges(ds: Dataset): Change[] {
  return METRICS.map((metric) => {
    const summary = summarize(ds, metric.primary);
    const dev = sd(summary);
    const shift = dev && summary.recentDelta !== null ? summary.recentDelta / dev : 0;
    return { metric, summary, shift, words: shiftWords(shift, summary.status) };
  }).sort((a, b) => {
    const out = (c: Change) => (c.summary.status === "above" || c.summary.status === "below" ? 1 : 0);
    return out(b) - out(a) || Math.abs(b.shift) - Math.abs(a.shift);
  });
}

export interface Connection extends Stretch {
  /** Each field's series, for drawing. */
  summaries: FieldSummary[];
  /** "sleep duration lower", "resting heart rate higher" */
  phrases: string[];
}

/** The stretch where the most measures left their usual range together; the latest one wins ties. */
export function strongestConnection(ds: Dataset): Connection | null {
  const all = (Object.keys(FIELDS) as FieldKey[]).map((f) => summarize(ds, f));
  const stretches = coMovingStretches(all);
  if (!stretches.length) return null;
  const best = stretches.reduce((a, b) => (b.fields.length >= a.fields.length ? b : a));
  return {
    ...best,
    summaries: best.fields.map((f) => all.find((s) => s.field === f.field)!),
    phrases: best.fields.map((f) => `${lowerLabel(f.field)} ${f.side === "above" ? "higher" : "lower"}`),
  };
}

/** Stretches this metric's fields took part in, for the metric page. */
export function connectionsFor(ds: Dataset, metric: MetricSpec): { stretch: Stretch; others: string[] }[] {
  const all = (Object.keys(FIELDS) as FieldKey[]).map((f) => summarize(ds, f));
  const own = new Set<FieldKey>([metric.primary, ...(metric.secondary ? [metric.secondary] : [])]);
  return coMovingStretches(all)
    .filter((s) => s.fields.some((f) => own.has(f.field)))
    .map((stretch) => ({
      stretch,
      others: stretch.fields.filter((f) => !own.has(f.field)).map((f) => `${lowerLabel(f.field)} ${f.side === "above" ? "higher" : "lower"}`),
    }));
}
