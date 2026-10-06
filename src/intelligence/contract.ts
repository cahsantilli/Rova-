// The boundary between the product and Rova's intelligence layer.
//
// Phase 1 (this MVP) has one capability: answer a question using only the uploaded values.
// Later phases (knowledge base / RAG, proactive insights, richer guardrails) plug in behind
// the same server endpoint and the same request/response shapes, so the UI doesn't change
// when the layer gets smarter.

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

export type AskResponse =
  | { ok: true; answer: string }
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
