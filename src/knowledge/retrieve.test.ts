import { describe, expect, it } from "vitest";
import { KNOWLEDGE } from "./kb";
import { MAX_RETRIEVED, retrieve } from "./retrieve";

const ids = (q: string, m?: Parameters<typeof retrieve>[1]) => retrieve(q, m).map((r) => r.entry.id);

describe("knowledge base", () => {
  it("has unique ids, and every outside claim names a real https source", () => {
    expect(new Set(KNOWLEDGE.map((k) => k.id)).size).toBe(KNOWLEDGE.length);
    for (const k of KNOWLEDGE) {
      if (k.source) expect(k.source.url).toMatch(/^https:\/\//);
      expect(k.text).not.toMatch(/\byou should\b|\brecommend(ed)? (you|that you)\b/i);
    }
  });
});

describe("retrieve", () => {
  it("returns nothing for questions about the person's own values", () => {
    expect(ids("What was my training load on Aug 13?", "training")).toEqual([]);
    expect(ids("How has my sleep been this month?", "sleep")).toEqual([]);
    expect(ids("Which days stood out the most?")).toEqual([]);
  });

  it("brings in reference ranges for 'normal' questions", () => {
    expect(ids("Is my resting heart rate normal?", "rhr")).toEqual(expect.arrayContaining(["rhr-normal-range", "rova-usual-range"]));
    expect(ids("Is my sleep enough?")).toEqual(["sleep-hours-adults"]);
  });

  it("brings in influences and the correlation note for 'why' questions", () => {
    expect(ids("Why did my HRV drop in mid-August?", "hrv")).toEqual(["hrv-influences", "rova-correlation"]);
    expect(ids("Did hard training cause my bad sleep?", "sleep")).toContain("rova-correlation");
  });

  it("stays on the metrics in view or named", () => {
    for (const r of retrieve("Is my HRV normal?", "hrv")) expect(r.entry.metrics.some((m) => m === "hrv" || m === "general")).toBe(true);
    expect(retrieve("Why is everything so high and why does it change?", "temperature").length).toBeLessThanOrEqual(MAX_RETRIEVED);
  });
});
