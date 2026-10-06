import { parseWellnessCsv } from "../src/domain/parse";
import { datasetAsContext, MAX_QUESTION_CHARS, metricFocus, type AskRequest, type AskResponse } from "../src/intelligence/contract";
import { LlmError, type LlmProvider } from "./llm";

// Phase 1 prompt: describe what the uploaded values show. The intelligence layer
// (knowledge, interpretation, insights, inference-time guardrails) comes later.
export const SYSTEM_PROMPT = `You are Rova, a wellness data companion. You help a person read their own wearable data.

Answer using only the data provided in the user message. Describe what the numbers show: values on specific dates, averages, highs and lows, how one period compares with another, and which days moved together. Use the units given. When a value is "missing", say there is no reading for that day; never estimate or fill it in.

Stay within the data. You are not a clinician: do not diagnose, name conditions, explain medical causes, or recommend treatments, supplements or training plans. If the question asks for any of that, or for something the data can't show, say briefly that you can only describe what the uploaded data shows, then offer what the data does show.

Keep answers short: two to five sentences of plain prose, no headings or lists unless the person asks for one. Write dates like "Aug 18".`;

export function buildUserMessage(req: AskRequest, context: string): string {
  const focus = metricFocus(req.metricId);
  return [`<data>\n${context}\n</data>`, focus, `Question: ${req.question.trim()}`].filter(Boolean).join("\n\n");
}

export function validateAskRequest(body: unknown): AskRequest | string {
  if (!body || typeof body !== "object") return "Request body must be JSON.";
  const b = body as Record<string, unknown>;
  if (typeof b.csv !== "string" || typeof b.question !== "string") return "Missing csv or question.";
  const q = b.question.trim();
  if (!q) return "Please type a question.";
  if (q.length > MAX_QUESTION_CHARS) return `Please keep questions under ${MAX_QUESTION_CHARS} characters.`;
  return {
    csv: b.csv,
    question: q,
    fileName: typeof b.fileName === "string" ? b.fileName : "data.csv",
    metricId: typeof b.metricId === "string" ? (b.metricId as AskRequest["metricId"]) : undefined,
  };
}

export async function handleAsk(body: unknown, llm: LlmProvider): Promise<{ status: number; body: AskResponse }> {
  const req = validateAskRequest(body);
  if (typeof req === "string") return { status: 400, body: { ok: false, error: req } };
  const parsed = parseWellnessCsv(req.csv, req.fileName);
  if (!parsed.ok) return { status: 400, body: { ok: false, error: "The data couldn't be read. Please upload the file again." } };
  try {
    const answer = await llm.complete({ system: SYSTEM_PROMPT, user: buildUserMessage(req, datasetAsContext(parsed.dataset)) });
    return { status: 200, body: { ok: true, answer } };
  } catch (e) {
    const msg = e instanceof LlmError ? e.userMessage : "Rova couldn't answer right now. Please try again.";
    console.error("[ask]", e instanceof Error ? e.message : e);
    return { status: 502, body: { ok: false, error: msg } };
  }
}
