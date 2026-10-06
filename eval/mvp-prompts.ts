// Builds the MVP (v1) Ask prompts for the validation questions. Run before the intelligent layer lands.
import { readFileSync, writeFileSync } from "node:fs";
import { parseWellnessCsv } from "../src/domain/parse";
import { datasetAsContext } from "../src/intelligence/contract";
import { buildUserMessage, SYSTEM_PROMPT } from "../src/intelligence/prompt";

const csv = readFileSync(new URL("../fixtures/rova_synthetic_wellness_30d.csv", import.meta.url), "utf8");
const r = parseWellnessCsv(csv);
if (!r.ok) throw new Error("bad csv");
const qs = JSON.parse(readFileSync(new URL("./questions.json", import.meta.url), "utf8"));
const out = qs.map((q: any) => ({ id: q.id, system: SYSTEM_PROMPT, user: buildUserMessage(q, datasetAsContext(r.dataset)) }));
writeFileSync(new URL("./results/mvp-prompts.json", import.meta.url), JSON.stringify(out, null, 2));
