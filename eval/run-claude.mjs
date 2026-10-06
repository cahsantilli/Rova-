// Runs prompt pairs {id, system, user} through the Claude CLI (no tools) and saves the raw answers.
// Usage: node eval/run-claude.mjs eval/results/<name>-prompts.json eval/results/<name>-answers.json
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const [, , inFile, outFile] = process.argv;
const prompts = JSON.parse(readFileSync(inFile, "utf8"));
const answers = [];
for (const p of prompts) {
  const text = execFileSync("claude", ["-p", "--tools", "", "--system-prompt", p.system], { input: p.user, encoding: "utf8", timeout: 300_000, maxBuffer: 10 * 1024 * 1024 }).trim();
  answers.push({ id: p.id, answer: text });
  console.log(`\n=== ${p.id} ===\n${text}`);
}
writeFileSync(outFile, JSON.stringify(answers, null, 2));
