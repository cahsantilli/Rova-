// Patterns in a person's own data: which days left their usual range, and stretches of days when
// several measures did so together. Deterministic; used by the overview, metric pages and Ask.

import { FIELDS, type FieldKey } from "./schema";
import type { FieldSummary } from "./stats";

/** A field counts toward a "stretch" when at least this many fields left their usual range together. */
export const STRETCH_MIN_FIELDS = 3;

/** "sleep duration", but "HRV" stays upper case. */
export function lowerLabel(field: FieldKey): string {
  const l = FIELDS[field].label;
  return l === l.toUpperCase() ? l : l.toLowerCase();
}

/** Dates (ISO) whose reading sits outside the usual range, with the side. */
export function outsideUsual(s: FieldSummary): { date: string; value: number; side: "above" | "below" }[] {
  if (!s.usual) return [];
  const out: { date: string; value: number; side: "above" | "below" }[] = [];
  for (const p of s.series) {
    if (p.value === null) continue;
    if (p.value > s.usual.high) out.push({ date: p.date, value: p.value, side: "above" });
    else if (p.value < s.usual.low) out.push({ date: p.date, value: p.value, side: "below" });
  }
  return out;
}

export interface Stretch {
  first: string;
  last: string;
  fields: { field: FieldKey; side: "above" | "below" }[];
}

/** Runs of consecutive days on which several fields were outside their usual range at once. */
export function coMovingStretches(summaries: FieldSummary[]): Stretch[] {
  const byDate = new Map<string, { field: FieldKey; side: "above" | "below" }[]>();
  for (const s of summaries) {
    for (const o of outsideUsual(s)) {
      const list = byDate.get(o.date) ?? [];
      list.push({ field: s.field, side: o.side });
      byDate.set(o.date, list);
    }
  }
  const dates = summaries[0].series.map((p) => p.date);
  const stretches: Stretch[] = [];
  let cur: Stretch | null = null;
  for (const d of dates) {
    const fields = byDate.get(d) ?? [];
    if (fields.length >= STRETCH_MIN_FIELDS) {
      if (!cur) cur = { first: d, last: d, fields: [] };
      cur.last = d;
      for (const f of fields) if (!cur.fields.some((x) => x.field === f.field && x.side === f.side)) cur.fields.push(f);
    } else if (cur) {
      stretches.push(cur);
      cur = null;
    }
  }
  if (cur) stretches.push(cur);
  // A single day is too thin to call a pattern.
  return stretches.filter((s) => s.first !== s.last);
}

