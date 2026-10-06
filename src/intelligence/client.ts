// How the browser reaches Rova's intelligence layer. Two transports, one contract:
// - inside a claude.ai Artifact, the page asks Claude directly on the viewer's own account;
// - anywhere else, the page calls Rova's server (/api/intelligence/*), which holds the API key.

import { parseWellnessCsv } from "../domain/parse";
import { type AskRequest, type AskResponse, type IntelligenceStatus } from "./contract";
import { AnswerError, answerQuestion } from "./answer";

interface SampleError { code: string; text?: string }
type Sample = (input: string, opts?: { signal?: AbortSignal; modelTier?: "default" | "quick" | "complex" }) => Promise<{ text: string; truncated: boolean }>;
interface ClaudeRuntime { use(name: "sample"): Promise<Sample | null> }

function runtime(): ClaudeRuntime | null {
  const c = (window as unknown as { claude?: ClaudeRuntime }).claude;
  return c && typeof c.use === "function" ? c : null;
}

let samplePromise: Promise<Sample | null> | null = null;
function getSample(): Promise<Sample | null> {
  const rt = runtime();
  if (!rt) return Promise.resolve(null);
  samplePromise ??= rt.use("sample").catch(() => null);
  return samplePromise;
}

/** Codes after which the Ask box should disappear for this view. */
const HIDE_CODES = new Set(["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"]);

function sampleErrorMessage(code: string): string {
  switch (code) {
    case "rate_limited": return "Rova is busy right now. Please try again in a moment.";
    case "session_expired": return "Please sign in to Claude again, then ask once more.";
    case "refused": return "Rova can't answer that question about your data. Try asking about specific values or dates.";
    case "prompt_too_large": return "This file is too large to ask about.";
    default: return "Rova couldn't answer right now. Please try again.";
  }
}

export async function fetchIntelligenceStatus(): Promise<IntelligenceStatus> {
  if (runtime()) return { available: (await getSample()) !== null };
  try {
    const res = await fetch("/api/intelligence/status");
    if (!res.ok) return { available: false };
    return (await res.json()) as IntelligenceStatus;
  } catch {
    return { available: false };
  }
}

/** Resolves an answer or a viewer-facing error. `hide: true` means the feature is unavailable for this view. */
export async function askAboutData(req: AskRequest, signal?: AbortSignal): Promise<AskResponse & { hide?: boolean }> {
  const sample = await getSample();
  if (sample) {
    const parsed = parseWellnessCsv(req.csv, req.fileName);
    if (!parsed.ok) return { ok: false, error: "The data couldn't be read. Please upload the file again." };
    try {
      // The page has no system prompt here, so the instructions lead the input.
      const answer = await answerQuestion(parsed.dataset, req, async ({ system, user }) => (await sample(`${system}\n\n${user}`, { signal })).text);
      return { ok: true, answer };
    } catch (e) {
      if (e instanceof AnswerError) return { ok: false, error: "Rova couldn't put together an answer it could check against your data. Try asking about specific dates or values." };
      const code = (e as SampleError)?.code ?? "upstream_error";
      if (code === "cancelled") throw Object.assign(new Error("aborted"), { name: "AbortError" });
      if (HIDE_CODES.has(code)) return { ok: false, error: "Ask isn't available in this view.", hide: true };
      return { ok: false, error: sampleErrorMessage(code) };
    }
  }

  try {
    const res = await fetch("/api/intelligence/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
    const body = (await res.json().catch(() => null)) as AskResponse | null;
    return body ?? { ok: false, error: "Rova couldn't read the answer. Please try again." };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return { ok: false, error: "Rova couldn't reach the server. Check your connection and try again." };
  }
}
