import { parseWellnessCsv } from "../src/domain/parse";
import { datasetAsContext, MAX_QUESTION_CHARS, type AskRequest, type AskResponse } from "../src/intelligence/contract";
import { buildUserMessage, SYSTEM_PROMPT } from "../src/intelligence/prompt";
import { LlmError, type LlmProvider } from "./llm";

export { SYSTEM_PROMPT };

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
