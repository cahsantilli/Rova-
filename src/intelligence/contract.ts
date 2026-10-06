// The boundary between the product and Rova's intelligence layer.
//
// Ask answers a question from three things, kept apart all the way to the screen: the person's
// own data (with their personal baseline), general knowledge retrieved from Rova's curated
// knowledge base, and tentative interpretation. See answer.ts for the pipeline.

import type { Dataset } from "../domain/parse";
import { FIELDS, METRICS, type FieldKey, type MetricId } from "../domain/schema";

export interface IntelligenceStatus {
  /** False when no model is configured; the UI then shows no AI surface at all. */
  available: boolean;
}

export interface AskRequest {
  /** The raw CSV text. The server re-validates it with the same parser the app uses. */
  csv: string;
  fileName: string;
  question: string;
  /** The metric the person is looking at, used only to focus the answer. */
  metricId?: MetricId;
}

export interface KnowledgeCitation {
  id: string;
  title: string;
  /** The answer's restatement of the entry. */
  text: string;
  /** null = Rova editorial. */
  source: { name: string; url: string } | null;
}

export interface RovaAnswer {
  /** A direct one- or two-sentence answer. */
  summary: string;
  /** Facts from the person's data, each with the dates it covers. */
  observed: { text: string; period: string }[];
  /** General knowledge, only from entries retrieved for this question. */
  knowledge: KnowledgeCitation[];
  /** Tentative readings of what a pattern might mean. Never stated as fact. */
  interpretation: string[];
  /** What the data can't show for this question (missing readings, dates outside the file). */
  insufficientData: string[];
  /** Set for questions about illness or advice: what Rova can't do. */
  boundary: string | null;
  /** The measures and period the answer used. */
  basis: string;
}

export type AskResponse =
  | { ok: true; answer: RovaAnswer }
  | { ok: false; error: string };

export const MAX_QUESTION_CHARS = 500;

/**
 * A compact, factual rendering of the dataset for a model to read.
 * Every value is copied from the file; missing values are written as "missing", never filled.
 */
export function datasetAsContext(ds: Dataset): string {
  const keys = Object.keys(FIELDS) as FieldKey[];
  const unitLine = keys.map((k) => `${k}: ${FIELDS[k].label}${FIELDS[k].unit ? ` (${FIELDS[k].unit})` : ""}`).join("\n");
  const rows = ds.days.map((d) => [d.date, ...keys.map((k) => d.values[k]?.raw ?? "missing")].join(","));
  return [
    `Period: ${ds.firstDate} to ${ds.lastDate} (${ds.days.length} rows).`,
    ds.absentDates.length ? `Dates with no row at all: ${ds.absentDates.join(", ")}.` : "Every date in the period has a row.",
    `Columns:\n${unitLine}`,
    `Data (CSV, "missing" = no reading that day):\ndate,${keys.join(",")}\n${rows.join("\n")}`,
  ].join("\n\n");
}

export function metricFocus(metricId: MetricId | undefined): string | null {
  const m = METRICS.find((x) => x.id === metricId);
  if (!m) return null;
  const fields = [m.primary, m.secondary].filter(Boolean).join(" and ");
  return `The person is currently viewing ${m.name} (${fields}).`;
}
