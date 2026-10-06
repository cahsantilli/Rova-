// Personal context for the intelligence layer: figures Rova computes itself, deterministically,
// so the model reads them instead of doing arithmetic. Every number here comes from the file.

import { isValidIsoDate, type Dataset } from "../domain/parse";
import { FIELDS, type FieldKey } from "../domain/schema";
import { summarize, type FieldSummary } from "../domain/stats";
import { formatNumber, shortDate } from "../domain/format";

const FIELD_KEYS = Object.keys(FIELDS) as FieldKey[];

function unit(field: FieldKey): string {
  return FIELDS[field].unit ? ` ${FIELDS[field].unit}` : "";
}

function v(field: FieldKey, value: number, extra = 0): string {
  return `${formatNumber(field, value, extra)}${unit(field)}`;
}

export { coMovingStretches, lowerLabel, outsideUsual, STRETCH_MIN_FIELDS, type Stretch } from "../domain/patterns";
import { coMovingStretches, lowerLabel, outsideUsual, STRETCH_MIN_FIELDS } from "../domain/patterns";

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** ISO dates the question refers to ("Aug 13", "13 August", "2026-08-13"), using the file's year. */
export function datesMentioned(question: string, ds: Dataset): string[] {
  const year = ds.firstDate.slice(0, 4);
  const found = new Set<string>();
  const add = (m: number, d: number) => {
    const iso = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (isValidIsoDate(iso)) found.add(iso);
  };
  for (const m of question.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)) if (isValidIsoDate(m[1])) found.add(m[1]);
  for (const m of question.matchAll(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi)) {
    const mi = MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0 && MONTH_NAMES[mi].startsWith(m[1].slice(0, 3).toLowerCase())) add(mi + 1, Number(m[2]));
  }
  for (const m of question.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})\b/gi)) {
    const mi = MONTH_NAMES.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi >= 0) add(mi + 1, Number(m[1]));
  }
  return [...found].sort();
}

export interface DateFacts {
  date: string;
  inPeriod: boolean;
  missing: FieldKey[];
}

export function factsForDates(ds: Dataset, dates: string[]): DateFacts[] {
  return dates.map((date) => {
    const inPeriod = date >= ds.firstDate && date <= ds.lastDate;
    const row = ds.days.find((d) => d.date === date);
    const missing = inPeriod ? FIELD_KEYS.filter((f) => !row || row.values[f] === null || row.values[f] === undefined) : [];
    return { date, inPeriod, missing };
  });
}

function fieldBlock(s: FieldSummary): string {
  const f = s.field;
  const lines = [`${FIELDS[f].label} (${f}):`];
  if (s.periodAvg === null) return `${lines[0]} no readings in the file.`;
  lines.push(`  30-day average ${v(f, s.periodAvg, 1)} from ${s.available} readings.`);
  lines.push(s.usual ? `  Usual range ${v(f, s.usual.low, 1)} to ${v(f, s.usual.high, 1)}.` : `  Too few readings to define a usual range.`);
  if (s.recentAvg !== null) {
    const status = s.status === "unknown" ? "" : `, ${s.status} the usual range`;
    lines.push(`  Last ${s.recentWindowDays} days average ${v(f, s.recentAvg, 1)} (${s.recentAvailable} readings)${status}.`);
  }
  if (s.periodMin && s.periodMax) {
    lines.push(`  Lowest ${v(f, s.periodMin.value!)} on ${shortDate(s.periodMin.date)}; highest ${v(f, s.periodMax.value!)} on ${shortDate(s.periodMax.date)}.`);
  }
  const out = outsideUsual(s);
  if (s.usual) {
    lines.push(out.length
      ? `  Days outside the usual range: ${out.map((o) => `${shortDate(o.date)} ${v(f, o.value)} (${o.side})`).join(", ")}.`
      : `  No days outside the usual range.`);
  }
  if (s.missingDates.length) lines.push(`  No reading on: ${s.missingDates.map(shortDate).join(", ")}.`);
  return lines.join("\n");
}

/** The personal-baseline block the model reads alongside the raw values. */
export function personalContext(ds: Dataset, question: string): string {
  const summaries = FIELD_KEYS.map((f) => summarize(ds, f));
  const blocks = [
    `Personal baseline, computed by Rova from this file (${shortDate(ds.firstDate)} – ${shortDate(ds.lastDate)}). "Usual range" = this person's average ± one standard deviation; "last 7 days" = ${shortDate(summaries[0].series.at(-7)?.date ?? ds.firstDate)} – ${shortDate(ds.lastDate)}.`,
    ...summaries.map(fieldBlock),
  ];
  const stretches = coMovingStretches(summaries);
  blocks.push(stretches.length
    ? `Stretches of 2 or more days where ${STRETCH_MIN_FIELDS} or more measures were outside their usual range together:\n${stretches.map((s) => `  ${shortDate(s.first)} – ${shortDate(s.last)}: ${s.fields.map((x) => `${lowerLabel(x.field)} ${x.side}`).join(", ")}.`).join("\n")}`
    : `No stretch of days had ${STRETCH_MIN_FIELDS} or more measures outside their usual range together.`);
  const facts = factsForDates(ds, datesMentioned(question, ds));
  if (facts.length) {
    blocks.push(`Dates named in the question:\n${facts.map((f) => !f.inPeriod
      ? `  ${shortDate(f.date)}: outside the file's period, so there is no data for it.`
      : f.missing.length
        ? `  ${shortDate(f.date)}: no reading for ${f.missing.map(lowerLabel).join(", ")}.`
        : `  ${shortDate(f.date)}: every measure has a reading.`).join("\n")}`);
  }
  return blocks.join("\n\n");
}
