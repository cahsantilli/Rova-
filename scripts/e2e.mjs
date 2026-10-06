// End-to-end run of the main journey: upload → view metrics → explore history.
// Usage: npm run build && npm start  (in another shell), then: npm run e2e
// Env: BASE_URL (default http://localhost:8787), CHROMIUM (path to a Chromium binary), SHOTS (screenshot dir).
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
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
  await page.waitForSelector(".metric-list");
  const rows = await page.$$eval(".metric-row", (els) => els.map((e) => e.innerText.replace(/\s+/g, " ")));
  check(rows.length === 6, `overview lists six metrics (${rows.length})`);
  const expectLatest = { Sleep: "7.1 h", HRV: "51 ms", "Resting Heart Rate": "54 bpm", Training: "53", Temperature: "0.0 °C", "Sleeping Respiration": "15.2 br/min" };
  for (const [name, val] of Object.entries(expectLatest)) {
    const row = rows.find((r) => r.startsWith(name + " "));
    check(row?.includes(val), `overview ${name} shows latest ${val} → "${row}"`);
  }
  const notes = await page.textContent(".data-notes");
  check(/3 readings are missing/.test(notes) && /training load on Aug 13/.test(notes) && /temperature deviation on Aug 8/.test(notes) && /sleeping respiration on Aug 27/.test(notes), "data notes name the three missing readings");
  check(await page.$('[data-testid="ask"]') === null, "no AI panel is shown when the server has no model configured");
  await page.screenshot({ path: `${SHOTS}/03-overview.png`, fullPage: true });

  // Every metric view.
  const metricIds = ["sleep", "hrv", "rhr", "training", "temperature", "respiration"];
  for (const [i, id] of metricIds.entries()) {
    await page.click(`.nav a[href="#/${id}"]`);
    await page.waitForSelector("#metric-title");
    const charts = await page.$$(".chart svg");
    check(charts.length >= 1, `${id}: chart renders`);
    const showAll = await page.$(".history .button");
    if (showAll) await showAll.click();
    const histRows = await page.$$eval(".history tbody tr", (els) => els.length);
    check(histRows === 30, `${id}: full history shows 30 days (${histRows})`);
    await page.screenshot({ path: `${SHOTS}/04-${i + 1}-${id}.png`, fullPage: true });
  }

  // Missing data is shown as missing, never zero.
  await page.click('.nav a[href="#/training"]');
  await page.click(".history .button");
  const aug13 = await page.$eval(".history tbody tr:has(th:text('Aug 13'))", (tr) => tr.innerText);
  check(/No reading/.test(aug13) && /21 min/.test(aug13), `training Aug 13 shows "No reading" for load and 21 min duration → "${aug13.replace(/\s+/g, " ")}"`);
  const legend = await page.textContent(".field-block.is-lead .legend");
  check(/no reading \(Aug 13\)/.test(legend), "training chart legend marks Aug 13 as no reading");
  const loadStats = await page.textContent(".field-block.is-lead .stats");
  check(/29 of 30 days/.test(loadStats), "training average says it uses 29 of 30 days");

  // Hover tooltip on the missing day.
  await page.$eval(".field-block.is-lead .chart", (el) => el.scrollIntoView({ block: "center" }));
  const box = await (await page.$(".field-block.is-lead .chart svg")).boundingBox();
  const slot = (box.width - 52) / 30;
  await page.mouse.move(box.x + 40 + slot * 12.5, box.y + 100);
  const tip = await page.textContent(".chart-tip").catch(() => "");
  check(/Thu, Aug 13/.test(tip) && /No reading/.test(tip), `tooltip on Aug 13 says no reading → "${tip}"`);
  await page.screenshot({ path: `${SHOTS}/05-training-missing-tooltip.png` });

  // Reload keeps the data for the session; back button works.
  await page.reload();
  await page.waitForSelector("#metric-title");
  check((await page.textContent("#metric-title")) === "Training", "reload keeps the uploaded data and current view");
  await page.goBack();
  await page.waitForTimeout(200);
  check(true, "back navigation works without errors");

  // Upload another file returns to the upload screen.
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
  await page.waitForSelector(".metric-list");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `mobile: no horizontal page scroll (${overflow}px)`);
  await page.screenshot({ path: `${SHOTS}/06-mobile-overview.png`, fullPage: true });
  await page.click('.nav a[href="#/sleep"]');
  await page.waitForSelector("#metric-title");
  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow2 <= 0, `mobile metric: no horizontal page scroll (${overflow2}px)`);
  await page.screenshot({ path: `${SHOTS}/07-mobile-sleep.png`, fullPage: true });
  await page.close();
}

// 3. Ask panel, with the AI endpoints stubbed in the browser (no model call is made).
{
  const page = await newPage({ width: 1280, height: 900 });
  let sent = null;
  await page.route("**/api/intelligence/status", (r) => r.fulfill({ json: { available: true } }));
  await page.route("**/api/intelligence/ask", (r) => {
    sent = r.request().postDataJSON();
    r.fulfill({ json: { ok: true, answer: "(stubbed answer for the test run)" } });
  });
  await page.goto(BASE);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.setInputFiles('[data-testid="file-input"]', CSV);
  await page.click('.nav a[href="#/hrv"]');
  await page.waitForSelector('[data-testid="ask"]');
  await page.fill('[data-testid="ask"] input', "Which day had my lowest HRV?");
  await page.click('[data-testid="ask"] button[type="submit"]');
  await page.waitForSelector(".ask-a");
  check(sent?.metricId === "hrv" && sent?.csv?.includes("2026-08-19,5.8,67,42"), "Ask sends the question, metric and unmodified CSV");
  check((await page.textContent(".ask-a")) === "(stubbed answer for the test run)", "Ask shows the answer");
  await page.screenshot({ path: `${SHOTS}/08-ask.png`, fullPage: true });
  await page.close();
}

check(consoleErrors.length === 0, `no browser console errors${consoleErrors.length ? ": " + consoleErrors.join(" | ") : ""}`);
await browser.close();
console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nAll checks passed");
process.exit(failures.length ? 1 : 0);
