import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWellnessCsv } from "./parse";
import { summarize } from "./stats";
import { formatValue } from "./format";

const SUPPLIED = readFileSync(new URL("../../fixtures/rova_synthetic_wellness_30d.csv", import.meta.url), "utf8");
const HEADER = "date,sleep_duration_hours,sleep_score,hrv_ms,resting_hr_bpm,training_load,training_duration_min,temperature_deviation_c,sleeping_respiration_bpm";

function ok(text: string) {
  const r = parseWellnessCsv(text);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.dataset;
}
function errs(text: string) {
  const r = parseWellnessCsv(text);
  if (r.ok) throw new Error("expected errors");
  return r.errors.map((e) => e.message).join(" | ");
}

describe("supplied dataset", () => {
  const ds = ok(SUPPLIED);

  it("loads every row with the right range", () => {
    expect(ds.days).toHaveLength(30);
    expect(ds.firstDate).toBe("2026-08-01");
    expect(ds.lastDate).toBe("2026-08-30");
    expect(ds.absentDates).toEqual([]);
    expect(ds.warnings).toEqual([]);
  });

  it("finds exactly the three missing cells and keeps them null, not zero", () => {
    expect(ds.missing).toEqual([
      { date: "2026-08-08", field: "temperature_deviation_c" },
      { date: "2026-08-13", field: "training_load" },
      { date: "2026-08-27", field: "sleeping_respiration_bpm" },
    ]);
    const d13 = ds.days.find((d) => d.date === "2026-08-13")!;
    expect(d13.values.training_load).toBeNull();
    expect(d13.values.training_duration_min).toEqual({ value: 21, raw: "21" });
  });

  it("preserves every value exactly as written", () => {
    const lines = SUPPLIED.trim().split("\n").slice(1);
    const cols = HEADER.split(",").slice(1);
    for (const line of lines) {
      const cells = line.split(",");
      const day = ds.days.find((d) => d.date === cells[0])!;
      cols.forEach((c, i) => {
        const raw = cells[i + 1];
        const cell = day.values[c as keyof typeof day.values];
        if (raw === "") expect(cell).toBeNull();
        else {
          expect(cell!.raw).toBe(raw);
          expect(cell!.value).toBe(Number(raw) === 0 ? 0 : Number(raw));
        }
      });
    }
  });

  it("excludes missing days from averages instead of counting them as zero", () => {
    const s = summarize(ds, "training_load");
    expect(s.available).toBe(29);
    const vals = ds.days.flatMap((d) => (d.values.training_load ? [d.values.training_load.value] : []));
    expect(s.periodAvg).toBeCloseTo(vals.reduce((a, b) => a + b, 0) / 29, 10);
    expect(s.missingDates).toEqual(["2026-08-13"]);
  });

  it("summarises the latest reading and the recent window", () => {
    const s = summarize(ds, "sleep_duration_hours");
    expect(s.latest).toEqual({ date: "2026-08-30", value: 7.1 });
    expect(s.recentWindowDays).toBe(7);
    expect(s.recentAvg).toBeCloseTo((7.2 + 7.3 + 7.7 + 7.5 + 7.7 + 7.1 + 7.7) / 7, 10);
    expect(s.periodMin).toEqual({ date: "2026-08-19", value: 5.8 });
    expect(s.periodMax).toEqual({ date: "2026-08-23", value: 8.0 });
  });

  it("formats -0.0 as 0.0 and positive deviations with a sign", () => {
    expect(formatValue("temperature_deviation_c", ds.days[0].values.temperature_deviation_c!.value)).toBe("0.0 °C");
    expect(formatValue("temperature_deviation_c", 0.2)).toBe("+0.2 °C");
    expect(formatValue("temperature_deviation_c", null)).toBe("No data");
  });
});

describe("validation", () => {
  it("rejects an empty file", () => expect(errs("")).toMatch(/empty/));
  it("rejects a header without rows", () => expect(errs(HEADER + "\n")).toMatch(/no data rows/));
  it("names missing columns", () => expect(errs("date,hrv_ms\n2026-08-01,50")).toMatch(/Missing expected columns: sleep_duration_hours/));
  it("rejects non-CSV content", () => expect(errs("%PDF-1.4 binary junk")).toMatch(/Missing expected columns/));
  it("rejects invalid dates", () => expect(errs(`${HEADER}\n2026-02-30,7,80,50,55,40,30,0,15`)).toMatch(/not a valid date/));
  it("rejects other date formats", () => expect(errs(`${HEADER}\n08/01/2026,7,80,50,55,40,30,0,15`)).toMatch(/YYYY-MM-DD/));
  it("rejects duplicate dates", () => expect(errs(`${HEADER}\n2026-08-01,7,80,50,55,40,30,0,15\n2026-08-01,7,80,50,55,40,30,0,15`)).toMatch(/more than once/));
  it("rejects non-numeric values with location", () => {
    const r = parseWellnessCsv(`${HEADER}\n2026-08-01,seven,80,50,55,40,30,0,15`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ line: 2, column: "sleep_duration_hours" });
  });
  it("rejects wrong field counts", () => expect(errs(`${HEADER}\n2026-08-01,7,80`)).toMatch(/Expected 9 values but found 3/));
  it("rejects impossible negatives", () => expect(errs(`${HEADER}\n2026-08-01,-7,80,50,55,40,30,0,15`)).toMatch(/negative/));
  it("accepts negative temperature deviation", () => expect(ok(`${HEADER}\n2026-08-01,7,80,50,55,40,30,-0.3,15`).days[0].values.temperature_deviation_c!.value).toBe(-0.3));
  it("treats NA tokens as missing", () => expect(ok(`${HEADER}\n2026-08-01,NA,80,50,55,40,30,0,15`).missing).toHaveLength(1));
  it("handles CRLF, BOM, reordered and extra columns", () => {
    const header = "notes,hrv_ms,date,sleep_duration_hours,sleep_score,resting_hr_bpm,training_load,training_duration_min,temperature_deviation_c,sleeping_respiration_bpm";
    const ds = ok(`﻿${header}\r\n"felt, fine",52,2026-08-01,7.5,82,55,40.0,30,-0.1,15.0\r\n`);
    expect(ds.days[0].values.hrv_ms!.value).toBe(52);
    expect(ds.days[0].values.sleep_duration_hours!.raw).toBe("7.5");
    expect(ds.warnings[0]).toMatch(/Ignored column not used by Rova: notes/);
  });
  it("reports calendar gaps as warnings, not invented rows", () => {
    const ds = ok(`${HEADER}\n2026-08-01,7,80,50,55,40,30,0,15\n2026-08-03,7,80,50,55,40,30,0,15`);
    expect(ds.days).toHaveLength(2);
    expect(ds.absentDates).toEqual(["2026-08-02"]);
    expect(summarize(ds, "hrv_ms").series.map((p) => p.value)).toEqual([50, null, 50]);
  });
  it("sorts out-of-order rows chronologically", () => {
    const ds = ok(`${HEADER}\n2026-08-02,7,80,51,55,40,30,0,15\n2026-08-01,7,80,50,55,40,30,0,15`);
    expect(ds.days.map((d) => d.date)).toEqual(["2026-08-01", "2026-08-02"]);
  });
});

describe("usual range", () => {
  const ds = ok(SUPPLIED);
  it("is the period average ± one sample standard deviation of available readings", () => {
    const s = summarize(ds, "hrv_ms");
    const vals = ds.days.map((d) => d.values.hrv_ms!.value);
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, v) => a + (v - m) ** 2, 0) / (vals.length - 1));
    expect(s.usual!.low).toBeCloseTo(m - sd, 10);
    expect(s.usual!.high).toBeCloseTo(m + sd, 10);
  });
  it("puts every metric's last 7 days within the usual range for the supplied data", () => {
    for (const f of ["sleep_duration_hours", "hrv_ms", "resting_hr_bpm", "training_load", "temperature_deviation_c", "sleeping_respiration_bpm"] as const) {
      expect(summarize(ds, f).status).toBe("within");
    }
  });
  it("is unknown with too few readings", () => {
    const one = ok(`${HEADER}\n2026-08-01,7,80,50,55,40,30,0,15`);
    expect(summarize(one, "hrv_ms").status).toBe("unknown");
  });
});
