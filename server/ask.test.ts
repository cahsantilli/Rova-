import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handleAsk } from "./ask";
import { SYSTEM_PROMPT } from "../src/intelligence/prompt";
import { LlmError, type LlmProvider } from "./llm";

const CSV = readFileSync(new URL("../fixtures/rova_synthetic_wellness_30d.csv", import.meta.url), "utf8");

function recorder(reply: string | Error) {
  const calls: { system: string; user: string; schema?: object }[] = [];
  const llm: LlmProvider = {
    async complete(input) {
      calls.push(input);
      if (reply instanceof Error) throw reply;
      return reply;
    },
  };
  return { llm, calls };
}

describe("handleAsk", () => {
  it("sends the uploaded values verbatim, with missing cells marked, and returns a structured answer", async () => {
    const reply = { summary: "Your HRV was lowest on Aug 19 at 42 ms.", observed: [{ text: "HRV was 42 ms on Aug 19.", period: "Aug 19" }], knowledge: [], interpretation: [], insufficientData: "", basis: "HRV, Aug 1 – Aug 30" };
    const { llm, calls } = recorder(JSON.stringify(reply));
    const res = await handleAsk({ csv: CSV, fileName: "x.csv", question: "When was HRV lowest?", metricId: "hrv" }, llm);
    expect(res).toEqual({ status: 200, body: { ok: true, answer: { ...reply, insufficientData: [], boundary: null } } });
    expect(calls).toHaveLength(1);
    expect(calls[0].system).toBe(SYSTEM_PROMPT);
    expect(calls[0].schema).toBeTruthy();
    const user = calls[0].user;
    expect(user).toContain("2026-08-19,5.8,67,42,60,88.0,87,0.2,15.7");
    expect(user).toContain("2026-08-13,7.5,87,55,54,missing,21,-0.0,14.9");
    expect(user).toContain("2026-08-27,7.7,79,49,56,52.0,52,0.0,missing");
    expect(user).toContain("currently viewing HRV");
    expect(user.trim().endsWith("Question: When was HRV lowest?")).toBe(true);
  });

  it("rejects empty and oversized questions without calling the model", async () => {
    const { llm, calls } = recorder("x");
    expect((await handleAsk({ csv: CSV, question: "  " }, llm)).status).toBe(400);
    expect((await handleAsk({ csv: CSV, question: "a".repeat(501) }, llm)).status).toBe(400);
    expect((await handleAsk({ question: "hi" }, llm)).status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("re-validates the CSV on the server", async () => {
    const { llm, calls } = recorder("x");
    const res = await handleAsk({ csv: "date,foo\n2026-01-01,1", question: "hi" }, llm);
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("returns a friendly error when the model fails", async () => {
    const { llm } = recorder(new LlmError("boom", "Rova is busy right now. Please try again in a moment."));
    const res = await handleAsk({ csv: CSV, question: "hi" }, llm);
    expect(res).toEqual({ status: 502, body: { ok: false, error: "Rova is busy right now. Please try again in a moment." } });
  });
});
