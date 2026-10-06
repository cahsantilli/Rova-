// End-to-end run of the main journey: upload → view metrics → explore history.
// Usage: npm run build && npm start  (in another shell), then: npm run e2e
// Env: BASE_URL (default http://localhost:8787), CHROMIUM (path to a Chromium binary), SHOTS (screenshot dir).
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASE = process.env.BASE_URL ?? "http://localhost:8787";
const SHOTS = process.env.SHOTS ?? "test-results";
const CSV = fileURLToPath(new URL("../fixtures/rova_synthetic_wellness_30d.csv", import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); console.log(`${cond ? "✓" : "✗"} ${msg}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const consoleErrors = [];

async function newPage(viewport) {
  const page = await browser.newPage({ viewport });
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  return page;
}

// 1. Desktop journey with the supplied CSV (no AI configured on the server).
{
  const page = await newPage({ width: 1280, height: 900 });
  await page.goto(BASE);
  await page.screenshot({ path: `${SHOTS}/01-upload.png`, fullPage: true });

  // Invalid file first.
  const bad = `${SHOTS}/bad.csv`;
  writeFileSync(bad, "date,sleep_duration_hours\n2026-13-01,abc\n");
  await page.setInputFiles('[data-testid="file-input"]', bad);
  await page.waitForSelector(".error-panel");
  const errText = await page.textContent(".error-panel");
  check(/Missing expected columns/.test(errText), "invalid file shows a clear missing-columns error");
  await page.screenshot({ path: `${SHOTS}/02-invalid.png`, fullPage: true });

  const notCsv = `${SHOTS}/notes.txt`;
  writeFileSync(notCsv, "hello");
  await page.setInputFiles('[data-testid="file-input"]', notCsv);
  await page.waitForFunction(() => document.querySelector(".error-panel")?.textContent?.includes(".csv"));
  check(true, "non-CSV file is rejected with a message");

  // Supplied dataset.
  await page.setInputFiles('[data-testid="file-input"]', CSV);
  await page.waitForSelector(".tiles");
  const headline = await page.textContent("#home-title");
  const detail = await page.textContent(".home-detail");
  check(headline === "Your week looks steady." && /All six metrics stayed within your usual range/.test(detail), `home answers "how am I doing" → "${headline} ${detail}"`);
  const rows = await page.$$eval(".tile", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ")));
  check(rows.length === 6, `home shows six metric tiles (${rows.length})`);
  const expectLatest = { Sleep: "7.1 h", HRV: "51 ms", "Resting Heart Rate": "54 bpm", Training: "53", Temperature: "0.0 °C", "Sleeping Respiration": "15.2 br/min" };
  for (const [name, val] of Object.entries(expectLatest)) {
    const row = rows.find((r) => r.startsWith(name + " "));
    check(row?.includes(val) && row?.includes("In your usual range"), `${name} tile shows latest ${val} and its status → "${row}"`);
  }
  const notes = await page.textContent(".data-notes");
  check(/3 readings are missing/.test(notes) && /training load on Aug 13/.test(notes) && /temperature deviation on Aug 8/.test(notes) && /sleeping respiration on Aug 27/.test(notes), "data notes name the three missing readings");
  check(await page.$('[data-testid="ask"]') === null, "no Ask box when no model is configured");
  await page.screenshot({ path: `${SHOTS}/03-overview.png`, fullPage: true });

  // Every metric detail: value → history → explanation → daily values.
  const metricIds = ["sleep", "hrv", "rhr", "training", "temperature", "respiration"];
  for (const [i, id] of metricIds.entries()) {
    await page.click(`[data-testid="overview-${id}"]`);
    await page.waitForSelector("#metric-title");
    check(await page.$(".detail-value .value") && await page.$(".chart svg") && await page.$(".explain"), `${id}: value, chart and explanation render`);
    const sentence = await page.textContent(".detail-sentence");
    check(/Your last 7 days averaged .* within your usual range of/.test(sentence), `${id}: "${sentence}"`);
    await page.click(".daily summary");
    const histRows = await page.$$eval(".daily tbody tr", (els) => els.length);
    check(histRows === 30, `${id}: daily values show 30 days (${histRows})`);
    await page.screenshot({ path: `${SHOTS}/04-${i + 1}-${id}.png`, fullPage: true });
    await page.click(".back");
    await page.waitForSelector(".tiles");
  }

  // Missing data is shown as missing, never zero.
  await page.click('[data-testid="overview-training"]');
  await page.click(".daily summary");
  const aug13 = await page.$eval(".daily tbody tr:has(th:text('Aug 13'))", (tr) => tr.innerText);
  check(/No reading/.test(aug13) && /21 min/.test(aug13), `training Aug 13 shows "No reading" for load and 21 min duration → "${aug13.replace(/\s+/g, " ")}"`);
  const legend = await page.textContent(".legend");
  check(/No reading on Aug 13/.test(legend), "training chart legend marks Aug 13 as no reading");
  const sentence = await page.textContent(".detail-sentence");
  check(/6 of 7 days|averaged/.test(sentence), `training sentence → "${sentence}"`);

  // Hover tooltip on the missing day.
  await page.$eval(".chart", (el) => el.scrollIntoView({ block: "center" }));
  const box = await (await page.$(".chart svg")).boundingBox();
  const slot = (box.width - 42) / 30;
  await page.mouse.move(box.x + 34 + slot * 12.5, box.y + 120);
  const tip = await page.textContent(".chart-tip").catch(() => "");
  check(/Thu, Aug 13/.test(tip) && /No reading/.test(tip), `tooltip on Aug 13 says no reading → "${tip}"`);
  await page.screenshot({ path: `${SHOTS}/05-training-missing-tooltip.png` });

  // Next link, reload and back.
  await page.click(".next");
  await page.waitForSelector("#metric-title");
  check((await page.textContent("#metric-title")) === "Temperature", "next link goes to the next metric");
  await page.reload();
  await page.waitForSelector("#metric-title");
  check((await page.textContent("#metric-title")) === "Temperature", "reload keeps the uploaded data and current view");
  await page.goBack();
  await page.waitForSelector("#metric-title");
  check((await page.textContent("#metric-title")) === "Training", "browser back returns to the previous metric");

  await page.click("text=Upload another file");
  await page.waitForSelector(".dropzone");
  check(true, "can return to upload");
  await page.close();
}

// 2. Mobile layout.
{
  const page = await newPage({ width: 390, height: 844 });
  await page.goto(BASE);
  await page.setInputFiles('[data-testid="file-input"]', CSV);
  await page.waitForSelector(".tiles");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `mobile: no horizontal page scroll (${overflow}px)`);
  await page.screenshot({ path: `${SHOTS}/06-mobile-overview.png`, fullPage: true });
  await page.click('[data-testid="overview-sleep"]');
  await page.waitForSelector("#metric-title");
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow2 <= 0, `mobile metric: no horizontal page scroll (${overflow2}px)`);
  await page.screenshot({ path: `${SHOTS}/07-mobile-sleep.png`, fullPage: true });
  await page.close();
}

// 3. Ask, with the AI endpoints stubbed in the browser (no model call is made).
// The stub is a real answer recorded by eval/run-v2.ts for "Why did my HRV drop in mid-August?".
const STUB_ANSWER = JSON.parse(readFileSync(new URL("../eval/results/v2-answers.json", import.meta.url), "utf8")).find((r) => r.id === "q2-causation").answer;
{
  const page = await newPage({ width: 1280, height: 900 });
  let sent = null;
  await page.route("**/api/intelligence/status", (r) => r.fulfill({ json: { available: true } }));
  await page.route("**/api/intelligence/ask", (r) => {
    sent = r.request().postDataJSON();
    r.fulfill({ json: { ok: true, answer: STUB_ANSWER } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.setInputFiles('[data-testid="file-input"]', CSV);
  await page.waitForSelector('.home [data-testid="ask"]');
  check(true, "home shows a compact Ask box when a model is available");
  await page.click('[data-testid="overview-hrv"]');
  await page.waitForSelector('[data-testid="ask"] .starter');
  await page.click('[data-testid="ask"] .starter');
  await page.waitForSelector(".ask-a");
  check(sent?.metricId === "hrv" && sent?.question === "When was my HRV lowest?" && sent?.csv?.includes("2026-08-19,5.8,67,42"), "a starter question sends the question, metric and unmodified CSV");
  check((await page.textContent(".ask-a")) === STUB_ANSWER.summary, "Ask shows the direct answer first");
  const parts = await page.$$eval(".ask-part", (els) => els.map((e) => [e.dataset.part, e.querySelector("h3").textContent]));
  check(JSON.stringify(parts) === JSON.stringify([["data", "From your data"], ["gaps", "Not in your data"], ["knowledge", "General knowledge"], ["interpretation", "What this might mean"]]), `Ask keeps data, gaps, knowledge and interpretation apart (${parts.map((p) => p[1]).join(" / ")})`);
  check((await page.$$eval('.ask-part[data-part="data"] .ask-period', (els) => els.length)) === STUB_ANSWER.observed.length, "each data point shows the period it covers");
  check((await page.getAttribute('.ask-part[data-part="knowledge"] .ask-source a', "href"))?.startsWith("https://my.clevelandclinic.org/"), "general knowledge links to its source");
  check(/Rova editorial/.test(await page.textContent('.ask-part[data-part="knowledge"]')), "Rova's own notes are labelled as editorial");
  check(/HRV/.test(await page.textContent(".ask-basis")), "Ask shows what the answer is based on");
  await page.fill('[data-testid="ask"] input', "Which day had my lowest HRV?");
  await page.click('[data-testid="ask"] button[type="submit"]');
  await page.waitForFunction(() => document.querySelector(".ask-q")?.textContent === "Which day had my lowest HRV?" && document.querySelector(".ask-a"));
  check(true, "typed questions work");
  await page.$eval('[data-testid="ask"]', (el) => el.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: `${SHOTS}/08-ask.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  const answerWidth = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(answerWidth <= 0, `the answer fits a phone screen (${answerWidth}px overflow)`);
  await page.$eval(".ask-result", (el) => el.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: `${SHOTS}/09-ask-mobile.png`, fullPage: false });
  await page.close();
}

check(consoleErrors.length === 0, `no browser console errors${consoleErrors.length ? ": " + consoleErrors.join(" | ") : ""}`);
await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nAll checks passed");
process.exit(failures.length ? 1 : 0);
