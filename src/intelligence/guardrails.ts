// Checks Rova runs on every model answer before the person sees it. They are deterministic, so the
// same answer always passes or fails the same way, and each failure names what was wrong so the
// model can be asked to repair it once.

import type { Dataset } from "../domain/parse";
import { shortDate } from "../domain/format";
import type { Retrieved } from "../knowledge/retrieve";
import { FIELDS, type FieldKey } from "../domain/schema";
import { summarize } from "../domain/stats";

export interface RawAnswer {
  summary: string;
  observed: { text: string; period: string }[];
  knowledge: { kbId: string; text: string }[];
  interpretation: string[];
  insufficientData: string;
  basis: string;
}

/** Questions about illness or diagnosis. */
const MEDICAL_INTENT = /\b(sick|ill|illness|disease|diagnos\w*|infect\w*|covid|flu|cold|fever|condition|disorder|doctor|medic\w*|dangerous|serious|worr(y|ied)|pregnan\w*|apnea|arrhythm\w*|afib|heart (problem|attack|disease))\b|\bam i (ok|okay|fine|healthy)\b/i;
/** Questions asking what to do. */
const ADVICE_INTENT = /\b(should i|what should|do i need|is it (ok|okay|safe) to|treat\w*|cure|pill|supplement\w*|how (can|do) i (improve|fix|raise|lower|increase|reduce))\b/i;

export type Boundary = "medical" | "advice";

/** Which line Rova must hold for this question, if any. Illness questions take precedence. */
export function boundaryFor(question: string): Boundary | null {
  if (MEDICAL_INTENT.test(question)) return "medical";
  if (ADVICE_INTENT.test(question)) return "advice";
  return null;
}

export const BOUNDARY_TEXT: Record<Boundary, string> = {
  medical: "Rova can't tell whether you're unwell or diagnose anything from wearable data. If you're concerned about how you feel, a healthcare professional is the right person to ask.",
  advice: "Rova describes what your data shows; it doesn't give training, medical or treatment advice. The decision is yours, and a coach or healthcare professional can help with it.",
};

export const BOUNDARY_RULE: Record<Boundary, string> = {
  medical: "This question asks about illness or a diagnosis. Do not speculate about illness or name conditions: say in the summary that Rova can't tell that from wearable data, then describe what the data shows.",
  advice: "This question asks what to do. Do not give advice or a recommendation either way: say in the summary that Rova doesn't give that kind of advice, then describe what the data shows that the person may find useful.",
};

const CAUSAL = /\b(caused|causes|causing|because of|due to|led to|leads to|lead to|resulted in|results in|triggered|is why|was why|the reason (for|why))\b/i;
const NEGATED = /\b(not|n't|cannot|no way|doesn't|can't|isn't)\b/i;
const HEDGE = /\b(may|might|could|can|possibly|perhaps|one possible|one possibility|it's possible|is possible|likely|suggests?)\b/i;
const ADVICE = /\b(you should|you need to|i recommend|i'd recommend|we recommend|try (to|taking|reducing|getting)|consider (taking|reducing|seeing|cutting)|make sure (to|you)|take (a |an |some )?(rest day|medication|supplement)|see a doctor|consult)\b/i;
const DIAGNOSIS = /\b(you (have|are getting|are coming down with|might have|may have|probably have|likely have)|sign of|signs of|symptom of|symptoms of|indicates?|consistent with) (a |an |the )?(cold|flu|covid|infection|illness|fever|virus|disease|condition|overtraining|burnout|sleep apnea|apnea|anxiety|depression)\b/i;

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const DATE_PATTERNS = [
  /\b\d{4}-\d{2}-\d{2}\b/g,
  new RegExp(`\\b(${MONTHS})[a-z]*\\.?\\s+\\d{1,2}\\b`, "gi"),
  new RegExp(`\\b\\d{1,2}\\s+(${MONTHS})[a-z]*\\b`, "gi"),
];

/** Every number a statement may use: the raw values, Rova's computed figures and the KB text. */
export function allowedNumbers(...texts: string[]): number[] {
  return texts.flatMap(numbersIn);
}

interface WrittenNumber {
  raw: string;
  /** The field a unit ties the number to ("42 ms" is HRV), if any. */
  fields: FieldKey[] | null;
  percent: boolean;
}

const UNIT_FIELDS: [RegExp, FieldKey[]][] = [
  [/^ms\b/i, ["hrv_ms"]],
  [/^br\/min\b|^breaths\b/i, ["sleeping_respiration_bpm"]],
  [/^bpm\b|^beats\b/i, ["resting_hr_bpm", "sleeping_respiration_bpm"]],
  [/^h\b|^hours?\b|^hrs?\b/i, ["sleep_duration_hours"]],
  [/^min\b|^minutes?\b|^mins\b/i, ["training_duration_min"]],
  [/^°\s?c?\b|^°/i, ["temperature_deviation_c"]],
];

/** Numbers as written in a text, ignoring dates and years. Signs are dropped: "-0.2" and "0.2 below" are the same figure. */
function writtenNumbers(text: string): WrittenNumber[] {
  let t = text;
  for (const re of DATE_PATTERNS) t = t.replace(re, " ");
  t = t.replace(/\b20\d\d\b/g, " ");
  return [...t.matchAll(/\d+(?:\.\d+)?/g)].map((m) => {
    const after = t.slice(m.index! + m[0].length).replace(/^\s+/, "");
    const unit = UNIT_FIELDS.find(([re]) => re.test(after));
    return { raw: m[0], fields: unit ? unit[1] : null, percent: /^(%|percent)/i.test(after) };
  });
}

export function numbersIn(text: string): number[] {
  return writtenNumbers(text).map((n) => Number(n.raw));
}

function matches(raw: string, allowed: number[]): boolean {
  const n = Number(raw);
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  // A figure may be a rounding of a more precise one ("55.6" → "56").
  const tol = decimals === 0 ? 0.5 : 0.5 * 10 ** -decimals + 1e-9;
  return allowed.some((a) => Math.abs(Math.abs(a) - n) <= tol);
}

/** Every figure Rova knows for each field: raw values and computed averages and range bounds. */
export function fieldFigures(ds: Dataset): Map<FieldKey, number[]> {
  const out = new Map<FieldKey, number[]>();
  for (const f of Object.keys(FIELDS) as FieldKey[]) {
    const s = summarize(ds, f);
    const vals = s.series.flatMap((p) => (p.value === null ? [] : [p.value]));
    const computed = [s.periodAvg, s.recentAvg, s.usual?.low, s.usual?.high].filter((x): x is number => typeof x === "number");
    out.set(f, [...vals, ...computed]);
  }
  return out;
}

function unknownNumbers(text: string, allowed: number[], figures?: Map<FieldKey, number[]>, reference: number[] = []): string[] {
  return writtenNumbers(text).filter((w) => {
    // A number with a unit must be a figure of that measure, or a reference figure from retrieved knowledge.
    if (w.fields && figures) return !matches(w.raw, [...w.fields.flatMap((f) => figures.get(f) ?? []), ...reference]);
    // Small whole numbers without a unit are counts ("3 nights", "7 days"); percentages never are.
    if (!w.percent && !w.raw.includes(".") && Number(w.raw) <= 31) return false;
    return !matches(w.raw, [...allowed, ...reference]);
  }).map((w) => (w.percent ? `${w.raw}%` : w.raw));
}

/** Dates in a text that fall outside the file's period, other than ones the question itself named. */
function datesOutside(text: string, ds: Dataset, named: Set<string>): string[] {
  const year = ds.firstDate.slice(0, 4);
  const months = MONTHS.split("|");
  const out: string[] = [];
  for (const m of text.matchAll(new RegExp(`\\b(${MONTHS})[a-z]*\\.?\\s+(\\d{1,2})\\b`, "gi"))) {
    const mi = months.indexOf(m[1].toLowerCase());
    const iso = `${year}-${String(mi + 1).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
    if ((iso < ds.firstDate || iso > ds.lastDate) && !named.has(iso)) out.push(m[0]);
  }
  return out;
}

function causalClaim(text: string): boolean {
  return text.split(/(?<=[.;])\s+/).some((s) => CAUSAL.test(s) && !NEGATED.test(s));
}

export interface CheckContext {
  ds: Dataset;
  /** ISO dates the question named; an answer may say there's no data for them. */
  namedDates: string[];
  retrieved: Retrieved[];
  /** Raw data and baseline text the model was given. */
  dataText: string;
  baselineText: string;
}

export interface Issue {
  /** Where the problem is, e.g. "observed[1]". */
  where: string;
  problem: string;
}

/** Lists every rule an answer breaks. An empty list means it can be shown. */
export function checkAnswer(a: RawAnswer, ctx: CheckContext): Issue[] {
  const issues: Issue[] = [];
  const dataNumbers = allowedNumbers(ctx.dataText, ctx.baselineText);
  const figures = fieldFigures(ctx.ds);
  const kbNumbers = ctx.retrieved.flatMap((r) => numbersIn(r.entry.text));
  const retrievedIds = new Set(ctx.retrieved.map((r) => r.entry.id));
  const range = `${shortDate(ctx.ds.firstDate)} – ${shortDate(ctx.ds.lastDate)}`;

  const factual: [string, string][] = [
    ["summary", a.summary],
    ["insufficientData", a.insufficientData],
    ...a.observed.map((o, i): [string, string] => [`observed[${i}]`, `${o.text} ${o.period}`]),
  ];
  for (const [where, text] of factual) {
    const bad = unknownNumbers(text, dataNumbers, figures);
    if (bad.length) issues.push({ where, problem: `uses numbers that are not in the data or baseline for that measure: ${bad.join(", ")}` });
    const outside = datesOutside(text, ctx.ds, new Set(ctx.namedDates));
    if (outside.length) issues.push({ where, problem: `names dates outside the file (${range}): ${outside.join(", ")}` });
  }
  for (const [where, text] of [...factual, ...a.interpretation.map((t, i): [string, string] => [`interpretation[${i}]`, t])]) {
    if (causalClaim(text)) issues.push({ where, problem: "states a cause; describe measures as moving together instead" });
    if (ADVICE.test(text)) issues.push({ where, problem: "gives advice; Rova doesn't give medical, treatment or training advice" });
    if (DIAGNOSIS.test(text)) issues.push({ where, problem: "suggests a diagnosis or condition" });
  }
  a.interpretation.forEach((t, i) => {
    if (!HEDGE.test(t)) issues.push({ where: `interpretation[${i}]`, problem: "is stated as fact; interpretations must be tentative (may, might, could)" });
    // Interpretation may set the person's figures against a reference range from retrieved knowledge.
    const bad = unknownNumbers(t, dataNumbers, figures, kbNumbers);
    if (bad.length) issues.push({ where: `interpretation[${i}]`, problem: `uses numbers that are not in the data or baseline for that measure: ${bad.join(", ")}` });
  });
  a.knowledge.forEach((k, i) => {
    const entry = ctx.retrieved.find((r) => r.entry.id === k.kbId)?.entry;
    if (!retrievedIds.has(k.kbId) || !entry) {
      issues.push({ where: `knowledge[${i}]`, problem: `cites "${k.kbId}", which is not in <knowledge>` });
      return;
    }
    const bad = unknownNumbers(k.text, allowedNumbers(entry.text));
    if (bad.length) issues.push({ where: `knowledge[${i}]`, problem: `uses numbers that are not in entry ${k.kbId}: ${bad.join(", ")}` });
    if (ADVICE.test(k.text) || DIAGNOSIS.test(k.text)) issues.push({ where: `knowledge[${i}]`, problem: "turns general knowledge into advice or a diagnosis" });
  });
  if (!a.summary.trim()) issues.push({ where: "summary", problem: "is empty" });
  return issues;
}

/** Removes the parts of an answer that still break a rule after the repair attempt. */
export function dropFailing(a: RawAnswer, issues: Issue[]): RawAnswer {
  const bad = new Set(issues.map((i) => i.where));
  return {
    summary: bad.has("summary") ? "" : a.summary,
    observed: a.observed.filter((_, i) => !bad.has(`observed[${i}]`)),
    knowledge: a.knowledge.filter((_, i) => !bad.has(`knowledge[${i}]`)),
    interpretation: a.interpretation.filter((_, i) => !bad.has(`interpretation[${i}]`)),
    insufficientData: a.insufficientData,
    basis: a.basis,
  };
}
