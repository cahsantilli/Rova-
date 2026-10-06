// Rova's Ask pipeline, shared by the server and the hosted page:
//   retrieve knowledge → build personal context → generate → check → repair once → drop what still fails.
// The model only writes; Rova decides what is shown.

import type { Dataset } from "../domain/parse";
import { FIELDS } from "../domain/schema";
import { shortDate } from "../domain/format";
import { retrieve, type Retrieved } from "../knowledge/retrieve";
import { datesMentioned, factsForDates, lowerLabel, personalContext } from "./baseline";
import { datasetAsContext, type AskRequest, type RovaAnswer } from "./contract";
import { BOUNDARY_RULE, BOUNDARY_TEXT, boundaryFor, checkAnswer, dropFailing, type Issue, type RawAnswer } from "./guardrails";
import { ANSWER_SCHEMA, buildUserMessage, SYSTEM_PROMPT } from "./prompt";

/** Anything that can turn a system prompt and a user message into text (JSON here). */
export type Complete = (input: { system: string; user: string; schema?: object }) => Promise<string>;

export class AnswerError extends Error {}

/** Reads the model's JSON, tolerating code fences or a sentence around it. */
export function parseRawAnswer(text: string): RawAnswer | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    summary: str(o.summary),
    observed: arr(o.observed).flatMap((x) => (x && typeof x === "object" && str((x as any).text) ? [{ text: str((x as any).text), period: str((x as any).period) }] : [])),
    knowledge: arr(o.knowledge).flatMap((x) => (x && typeof x === "object" && str((x as any).kbId) ? [{ kbId: str((x as any).kbId), text: str((x as any).text) }] : [])),
    interpretation: arr(o.interpretation).flatMap((x) => (str(x) ? [str(x)] : [])),
    insufficientData: str(o.insufficientData),
    basis: str(o.basis),
  };
}

/** Facts Rova knows deterministically: missing readings and out-of-range dates the question names. */
export function dataGaps(ds: Dataset, question: string): string[] {
  return factsForDates(ds, datesMentioned(question, ds)).flatMap((f) => {
    if (!f.inPeriod) return [`Your file covers ${shortDate(ds.firstDate)} – ${shortDate(ds.lastDate)}, so there is no data for ${shortDate(f.date)}.`];
    if (f.missing.length === Object.keys(FIELDS).length) return [`There are no readings at all on ${shortDate(f.date)}.`];
    if (f.missing.length) return [`There is no ${f.missing.map(lowerLabel).join(" or ")} reading for ${shortDate(f.date)}.`];
    return [];
  });
}

function repairNote(issues: Issue[]): string {
  return `Your previous answer broke Rova's rules:\n${issues.map((i) => `- ${i.where} ${i.problem}`).join("\n")}\nWrite the whole answer again following every rule. Remove or rewrite those parts; do not add new claims.`;
}

export interface AnswerTrace {
  retrieved: Retrieved[];
  firstIssues: Issue[];
  finalIssues: Issue[];
}

export async function answerQuestion(
  ds: Dataset,
  req: Pick<AskRequest, "question" | "metricId">,
  complete: Complete,
  trace?: (t: AnswerTrace) => void,
): Promise<RovaAnswer> {
  const retrieved = retrieve(req.question, req.metricId);
  const dataText = datasetAsContext(ds);
  const baselineText = personalContext(ds, req.question);
  const boundary = boundaryFor(req.question);
  const user = buildUserMessage(req, dataText, baselineText, retrieved, boundary ? [BOUNDARY_RULE[boundary]] : []);
  const ctx = { ds, retrieved, dataText, baselineText, namedDates: datesMentioned(req.question, ds) };

  let raw = parseRawAnswer(await complete({ system: SYSTEM_PROMPT, user, schema: ANSWER_SCHEMA }));
  const firstIssues = raw ? checkAnswer(raw, ctx) : [{ where: "answer", problem: "was not the JSON object asked for" }];
  let finalIssues = firstIssues;
  if (firstIssues.length) {
    const retry = parseRawAnswer(await complete({ system: SYSTEM_PROMPT, user: `${user}\n\n${repairNote(firstIssues)}`, schema: ANSWER_SCHEMA }));
    if (retry) {
      raw = retry;
      finalIssues = checkAnswer(retry, ctx);
    }
  }
  if (!raw) throw new AnswerError("unparseable answer");
  const safe = finalIssues.length ? dropFailing(raw, finalIssues) : raw;
  trace?.({ retrieved, firstIssues, finalIssues });

  // Rova states missing readings itself; the model's note is used when Rova has nothing to add.
  const gaps = dataGaps(ds, req.question);
  const insufficient = gaps.length ? gaps : safe.insufficientData ? [safe.insufficientData] : [];

  const summary = safe.summary || (boundary ? "" : safe.observed[0]?.text ?? "");
  if (!summary && !safe.observed.length && !insufficient.length && !boundary) throw new AnswerError("nothing grounded to show");

  return {
    summary,
    observed: safe.observed,
    knowledge: safe.knowledge.map((k) => {
      const entry = retrieved.find((r) => r.entry.id === k.kbId)!.entry;
      return { id: entry.id, title: entry.title, text: k.text || entry.text, source: entry.source ? { ...entry.source } : null };
    }),
    interpretation: safe.interpretation,
    insufficientData: insufficient,
    boundary: boundary ? BOUNDARY_TEXT[boundary] : null,
    basis: safe.basis || `Your data, ${shortDate(ds.firstDate)} – ${shortDate(ds.lastDate)}`,
  };
}

