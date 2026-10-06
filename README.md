# Rova — MVP

Rova turns a wellness CSV export into a calm, readable view of six metrics (Sleep, HRV, Resting Heart Rate, Training, Temperature, Sleeping Respiration) against the person's own history.

## Open it

Hosted build (claude.ai Artifact): https://claude.ai/artifact/Lae2RdyRiYdNhFtcjmdE8h
Upload `fixtures/rova_synthetic_wellness_30d.csv`. In the hosted build, Ask runs on the viewer's own Claude account (the first question asks for permission). Rebuild it with `npm run build:artifact` → `artifact/rova.html`.

## Run locally

```bash
npm install
npm run build
npm start                 # http://localhost:8787
```

Development (hot reload): `npm run dev` (Vite on :5173, API on :8787).

Locally, the optional "Ask about your data" box appears only when the server has `ANTHROPIC_API_KEY` set (e.g. `ANTHROPIC_API_KEY=sk-... npm start`). Without it, no AI surface is shown. `ROVA_MODEL` overrides the model (default `claude-opus-5-5`).

## Test

```bash
npm test                  # parser, validation, missing data, retrieval, guardrails and Ask pipeline tests
npm run typecheck
npm run build && npm start &   # then:
CHROMIUM=/path/to/chromium npm run e2e   # upload → metrics → history, desktop + mobile, screenshots in test-results/
```

`fixtures/rova_synthetic_wellness_30d.csv` is an unmodified copy of the supplied dataset.

## Structure

```
src/domain/        CSV contract, parsing + validation, stats, formatting (pure, tested)
src/ui/            Upload, Overview ("How am I doing?"), MetricView, Chart (hand-drawn SVG), Ask
src/domain/summary.ts  Plain-language week summary: last 7 days vs your usual range (deterministic)
src/knowledge/     Curated knowledge base (kb.ts, every outside claim with its source) and retrieval
src/intelligence/  The Ask pipeline, shared by server and hosted page:
  baseline.ts      Personal context Rova computes itself: usual ranges, last 7 days, days outside
                   the usual range, stretches when measures moved together, dates named in a question
  prompt.ts        Rules and the JSON answer shape (data / knowledge / interpretation kept apart)
  guardrails.ts    Deterministic checks: numbers must exist for that measure, knowledge must be
                   retrieved, no causal claims, no advice or diagnosis, interpretations hedged
  answer.ts        retrieve → context → generate → check → repair once → drop what still fails
  client.ts        Artifact runtime when hosted on claude.ai, otherwise the Rova server
server/            Small Node server: static files + /api/intelligence/*
  llm.ts           LlmProvider interface + Anthropic implementation (structured output)
  ask.ts           Request handling (server re-validates the CSV)
eval/              The five validation questions, edge cases, and recorded MVP vs phase 2 answers
```

Data handling rules:
- Missing cells (empty, NA, null…) stay `null`. They are excluded from averages, shown as gaps in charts and "No reading" in history, and listed under "About this data".
- Values are kept exactly as parsed; `-0.0` is displayed as `0.0`.
- Days absent from the file appear as gaps, never filled.

## Evaluating Ask

`eval/questions.json` holds the five validation questions. `npx tsx eval/run-v2.ts` runs them through the
current pipeline (using the local `claude` CLI as the model) and writes `eval/results/v2-answers.json`;
`eval/results/mvp-answers.json` holds the MVP's answers to the same questions. `QUESTIONS=./edge-questions.json
OUT=./results/v2-edge-answers.json npx tsx eval/run-v2.ts` runs the edge cases (advice, diagnosis, unrecorded
measures, dates outside the file, causal questions).
