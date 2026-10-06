# Rova — MVP

Rova turns a wellness CSV export into a calm, readable view of six metrics (Sleep, HRV, Resting Heart Rate, Training, Temperature, Sleeping Respiration) against the person's own history.

## Run

```bash
npm install
npm run build
npm start                 # http://localhost:8787
```

Development (hot reload): `npm run dev` (Vite on :5173, API on :8787).

The optional "Ask about your data" box appears only when the server has `ANTHROPIC_API_KEY` set. Without it, no AI surface is shown. `ROVA_MODEL` overrides the model (default `claude-opus-5-5`).

## Test

```bash
npm test                  # parser, validation, missing-data and Ask handler tests
npm run typecheck
npm run build && npm start &   # then:
CHROMIUM=/path/to/chromium npm run e2e   # upload → metrics → history, desktop + mobile, screenshots in test-results/
```

`fixtures/rova_synthetic_wellness_30d.csv` is an unmodified copy of the supplied dataset.

## Structure

```
src/domain/        CSV contract, parsing + validation, stats, formatting (pure, tested)
src/ui/            Upload, Overview, MetricView, Chart (hand-drawn SVG), Ask
src/intelligence/  The boundary to the AI layer: request/response contract + browser client
server/            Small Node server: static files + /api/intelligence/*
  llm.ts           LlmProvider interface + Anthropic implementation
  ask.ts           Phase 1 prompt and request handling (server re-validates the CSV)
```

Data handling rules:
- Missing cells (empty, NA, null…) stay `null`. They are excluded from averages, shown as gaps in charts and "No reading" in history, and listed under "About this data".
- Values are kept exactly as parsed; `-0.0` is displayed as `0.0`.
- Days absent from the file appear as gaps, never filled.

## Next phase (intelligence layer)

Everything AI goes through `/api/intelligence/*` and `LlmProvider`. Retrieval/knowledge base, proactive insights and inference-time guardrails can be added inside `server/` (e.g. new context builders next to `datasetAsContext`, new endpoints beside `ask`) without changing the domain or UI layers.
