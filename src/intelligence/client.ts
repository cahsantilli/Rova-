import type { AskRequest, AskResponse, IntelligenceStatus } from "./contract";

export async function fetchIntelligenceStatus(): Promise<IntelligenceStatus> {
  try {
    const res = await fetch("/api/intelligence/status");
    if (!res.ok) return { available: false };
    return (await res.json()) as IntelligenceStatus;
  } catch {
    return { available: false };
  }
}

export async function askAboutData(req: AskRequest, signal?: AbortSignal): Promise<AskResponse> {
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
