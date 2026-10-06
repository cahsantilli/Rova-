// Runs the validation questions through the phase 2 Ask pipeline, using the local Claude CLI as the model.
// Usage: npx tsx eval/run-v2.ts [questionId]
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseWellnessCsv } from "../src/domain/parse";
import { answerQuestion, type AnswerTrace } from "../src/intelligence/answer";

const csv = readFileSync(new URL("../fixtures/rova_synthetic_wellness_30d.csv", import.meta.url), "utf8");
const r = parseWellnessCsv(csv, "rova_synthetic_wellness_30d.csv");
if (!r.ok) throw new Error("bad csv");
const only = process.argv[2];
const file = process.env.QUESTIONS ?? "./questions.json";
const qs = (JSON.parse(readFileSync(new URL(file, import.meta.url), "utf8")) as any[]).filter((q) => !only || q.id === only);

const results: any[] = [];
for (const q of qs) {
  let calls = 0;
  let trace: AnswerTrace | undefined;
  const answer = await answerQuestion(r.dataset, q, async ({ system, user }) => {
    calls++;
    return execFileSync("claude", ["-p", "--tools", "", "--system-prompt", system], { input: user, encoding: "utf8", timeout: 300_000, maxBuffer: 10 * 1024 * 1024 });
  }, (t) => (trace = t));
  const row = {
    id: q.id,
    question: q.question,
    answer,
    modelCalls: calls,
    retrieved: trace?.retrieved.map((x) => x.entry.id),
    issuesBeforeRepair: trace?.firstIssues,
    issuesAfterRepair: trace?.finalIssues,
  };
  results.push(row);
  console.log(JSON.stringify(row, null, 2));
}
if (!only) writeFileSync(new URL(process.env.OUT ?? "./results/v2-answers.json", import.meta.url), JSON.stringify(results, null, 2));
