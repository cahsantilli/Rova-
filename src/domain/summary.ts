// "How am I doing?" in plain words. Deterministic: it only restates how each metric's
// last 7 days sit against the person's own usual range. No interpretation or advice.

import type { Dataset } from "./parse";
import { METRICS, type MetricSpec } from "./schema";
import { summarize, type FieldSummary } from "./stats";

export interface MetricState {
  metric: MetricSpec;
  summary: FieldSummary;
}

export interface WeekSummary {
  headline: string;
  detail: string;
  states: MetricState[];
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "HRV" stays as written; "Resting Heart Rate" becomes "resting heart rate" mid-sentence. */
export function inSentence(name: string): string {
  return name === name.toUpperCase() ? name : name.toLowerCase();
}

export function summarizeWeek(ds: Dataset): WeekSummary {
  const states = METRICS.map((metric) => ({ metric, summary: summarize(ds, metric.primary) }));
  const known = states.filter((s) => s.summary.status !== "unknown");
  const within = known.filter((s) => s.summary.status === "within");
  const above = known.filter((s) => s.summary.status === "above").map((s) => inSentence(s.metric.name));
  const below = known.filter((s) => s.summary.status === "below").map((s) => inSentence(s.metric.name));

  if (known.length === 0) {
    return { headline: "Here's your data so far.", detail: "There aren't enough readings yet to know what's usual for you.", states };
  }

  const count = within.length === known.length ? (known.length === 6 ? "All six metrics" : `All ${known.length} metrics with enough readings`) : null;
  if (count) {
    return { headline: "Your week looks steady.", detail: `${count} stayed within your usual range over the last 7 days.`, states };
  }

  const parts: string[] = [];
  if (above.length) parts.push(`${joinNames(above)} ${above.length > 1 ? "were" : "was"} higher than usual`);
  if (below.length) parts.push(`${joinNames(below)} ${below.length > 1 ? "were" : "was"} lower than usual`);
  const sentence = parts.join(", and ");
  const headline = within.length >= known.length / 2 ? "Most of your week was in your usual range." : "Your week looked different from usual.";
  return { headline, detail: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} over the last 7 days.`, states };
}
