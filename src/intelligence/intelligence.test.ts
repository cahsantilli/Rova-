import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWellnessCsv, type Dataset } from "../domain/parse";
import { retrieve } from "../knowledge/retrieve";
import { answerQuestion, dataGaps, parseRawAnswer, type Complete } from "./answer";
import { coMovingStretches, datesMentioned, personalContext } from "./baseline";
import { datasetAsContext } from "./contract";
import { boundaryFor, checkAnswer, type RawAnswer } from "./guardrails";
import { summarize } from "../domain/stats";
import { FIELDS, type FieldKey } from "../domain/schema";

const CSV = readFileSync(new URL("../../fixtures/rova_synthetic_wellness_30d.csv", import.meta.url), "utf8");
const parsed = parseWellnessCsv(CSV, "x.csv");
if (!parsed.ok) throw new Error("fixture must parse");
const ds: Dataset = parsed.dataset;

function raw(over: Partial<RawAnswer> = {}): RawAnswer {
  return { summary: "Your HRV was lowest on Aug 19.", observed: [], knowledge: [], interpretation: [], insufficientData: "", basis: "HRV, Aug 1 – Aug 30", ...over };
}

function ctx(question: string, metricId?: Parameters<typeof retrieve>[1]) {
  return { ds, retrieved: retrieve(question, metricId), dataText: datasetAsContext(ds), baselineText: personalContext(ds, question), namedDates: datesMentioned(question, ds) };
}

describe("personal baseline", () => {
  it("finds the Aug 16 – Aug 20 stretch when many measures left their usual range together", () => {
    const stretches = coMovingStretches((Object.keys(FIELDS) as FieldKey[]).map((f) => summarize(ds, f)));
    const mid = stretches.find((s) => s.first === "2026-08-16");
    expect(mid?.last).toBe("2026-08-20");
    expect(mid?.fields.map((f) => `${f.field}:${f.side}`)).toEqual(expect.arrayContaining(["hrv_ms:below", "sleep_duration_hours:below", "training_load:above", "resting_hr_bpm:above"]));
  });

  it("reads dates in the question and states missing readings as facts", () => {
    expect(datesMentioned("What about Aug 13 and 3 September, or 2026-08-01?", ds)).toEqual(["2026-08-01", "2026-08-13", "2026-09-03"]);
    expect(dataGaps(ds, "What was my training load on Aug 13?")).toEqual(["There is no training load reading for Aug 13."]);
    expect(dataGaps(ds, "HRV on Sep 3?")).toEqual(["Your file covers Aug 1 – Aug 30, so there is no data for Sep 3."]);
    expect(personalContext(ds, "Aug 13?")).toContain("Aug 13: no reading for training load.");
  });
});

describe("guardrails", () => {
  it("passes an answer that only uses figures from the data and baseline", () => {
    const a = raw({ observed: [{ text: "HRV fell to 42 ms on Aug 19, below your usual range of 47.5 ms to 56.8 ms; your 30-day average was 52.2 ms.", period: "Aug 16 – Aug 20" }] });
    expect(checkAnswer(a, ctx("When was my HRV lowest?", "hrv"))).toEqual([]);
  });

  it("flags invented numbers", () => {
    const issues = checkAnswer(raw({ observed: [{ text: "HRV dropped 12% to 37 ms, and you slept 6.3 h.", period: "Aug 19" }] }), ctx("x", "hrv"));
    expect(issues[0]).toMatchObject({ where: "observed[0]" });
    // 37 appears in the file, but as a training value, not an HRV reading; 6.3 h was never recorded.
    expect(issues[0].problem).toContain("12%, 37, 6.3");
  });

  it("flags knowledge that wasn't retrieved, or numbers the entry doesn't contain", () => {
    const q = "Is my resting heart rate normal?";
    expect(checkAnswer(raw({ knowledge: [{ kbId: "sleep-hours-adults", text: "Adults need 7 hours." }] }), ctx(q, "rhr"))[0].problem).toContain("not in <knowledge>");
    expect(checkAnswer(raw({ knowledge: [{ kbId: "rhr-normal-range", text: "Normal is 50 to 90 bpm." }] }), ctx(q, "rhr"))[0].problem).toContain("50");
    expect(checkAnswer(raw({ knowledge: [{ kbId: "rhr-normal-range", text: "Normal is 60 to 100 bpm at rest." }] }), ctx(q, "rhr"))).toEqual([]);
    // Interpretation may compare with a retrieved reference range, but observations may not borrow its numbers.
    expect(checkAnswer(raw({ interpretation: ["Your 55.6 bpm average sits below the 60 to 100 bpm range, which may be your own pattern."] }), ctx(q, "rhr"))).toEqual([]);
    expect(checkAnswer(raw({ observed: [{ text: "Your resting heart rate reached 100 bpm.", period: "Aug 19" }] }), ctx(q, "rhr"))[0].problem).toContain("100");
  });

  it("flags causal claims, unhedged interpretation, advice and diagnosis", () => {
    const c = ctx("Why did my HRV drop?", "hrv");
    expect(checkAnswer(raw({ interpretation: ["Hard training caused your HRV to drop."] }), c).map((i) => i.problem).join()).toMatch(/cause.*fact|fact.*cause/s);
    expect(checkAnswer(raw({ interpretation: ["The data can't show that training caused it, but they may be related."] }), c)).toEqual([]);
    expect(checkAnswer(raw({ summary: "You should take a rest day." }), c)[0].problem).toContain("advice");
    expect(checkAnswer(raw({ summary: "This may be a sign of an infection." }), c)[0].problem).toContain("diagnosis");
  });

  it("flags dates outside the file unless the question named them", () => {
    expect(checkAnswer(raw({ summary: "Your HRV on Sep 5 was 50 ms." }), ctx("x", "hrv"))[0].problem).toContain("outside the file");
    expect(checkAnswer(raw({ summary: "There is no data for Sep 3." }), ctx("What was my HRV on Sep 3?", "hrv"))).toEqual([]);
  });

  it("knows which questions need a boundary", () => {
    expect(boundaryFor("Am I getting sick?")).toBe("medical");
    expect(boundaryFor("Do I have sleep apnea?")).toBe("medical");
    expect(boundaryFor("Should I take a rest day?")).toBe("advice");
    expect(boundaryFor("When was my HRV lowest?")).toBeNull();
  });
});

describe("answerQuestion", () => {
  function model(...replies: string[]) {
    const calls: { system: string; user: string }[] = [];
    const complete: Complete = async (input) => {
      calls.push(input);
      return replies[Math.min(calls.length - 1, replies.length - 1)];
    };
    return { complete, calls };
  }

  it("gives the model the data, the baseline and only the retrieved knowledge", async () => {
    const { complete, calls } = model(JSON.stringify(raw({ knowledge: [{ kbId: "rhr-normal-range", text: "60 to 100 bpm is the usual adult range at rest." }] })));
    const a = await answerQuestion(ds, { question: "Is my resting heart rate normal?", metricId: "rhr" }, complete);
    const user = calls[0].user;
    expect(user).toContain("2026-08-13,7.5,87,55,54,missing,21,-0.0,14.9");
    expect(user).toContain("Usual range 53.5 bpm to 57.8 bpm.");
    expect(user).toContain("[rhr-normal-range]");
    expect(user).not.toContain("[sleep-hours-adults]");
    expect(a.knowledge[0]).toMatchObject({ id: "rhr-normal-range", source: { name: expect.stringContaining("American Heart Association") } });
    expect(calls).toHaveLength(1);
  });

  it("asks once for a repair, then drops whatever still breaks a rule", async () => {
    const bad = raw({ observed: [{ text: "HRV was 42 ms on Aug 19.", period: "Aug 19" }, { text: "HRV fell 23%.", period: "Aug 15 – Aug 19" }], interpretation: ["Training caused it."] });
    const { complete, calls } = model(JSON.stringify(bad));
    const a = await answerQuestion(ds, { question: "When was my HRV lowest?", metricId: "hrv" }, complete);
    expect(calls).toHaveLength(2);
    expect(calls[1].user).toContain("broke Rova's rules");
    expect(a.observed.map((o) => o.text)).toEqual(["HRV was 42 ms on Aug 19."]);
    expect(a.interpretation).toEqual([]);
  });

  it("states missing readings itself and holds the line on medical questions", async () => {
    const { complete } = model("```json\n" + JSON.stringify(raw({ summary: "Rova can't tell that from wearable data." })) + "\n```");
    const a = await answerQuestion(ds, { question: "My temperature was up on Aug 8. Am I getting sick?", metricId: "temperature" }, complete);
    expect(a.insufficientData).toEqual(["There is no temperature deviation reading for Aug 8."]);
    expect(a.boundary).toContain("can't tell whether you're unwell");
  });

  it("tolerates prose around the JSON and rejects non-answers", () => {
    expect(parseRawAnswer('Here you go: {"summary":"Hi","observed":[],"knowledge":[],"interpretation":[],"insufficientData":"","basis":"x"}')?.summary).toBe("Hi");
    expect(parseRawAnswer("no json here")).toBeNull();
  });
});
