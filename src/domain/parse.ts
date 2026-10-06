import { DATE_COLUMN, EXPECTED_COLUMNS, FIELDS, type FieldKey } from "./schema";

/** A single cell. `null` means the source had no value: never zero, never estimated. */
export type Cell = { value: number; raw: string } | null;

export interface DayRecord {
  /** ISO date, YYYY-MM-DD, as written in the file. */
  date: string;
  /** Source line number (1-based, header is line 1). */
  line: number;
  values: Record<FieldKey, Cell>;
}

export interface MissingCell {
  date: string;
  field: FieldKey;
}

export interface Dataset {
  fileName: string;
  days: DayRecord[];
  firstDate: string;
  lastDate: string;
  missing: MissingCell[];
  /** Calendar dates between first and last that have no row at all. */
  absentDates: string[];
  warnings: string[];
}

export interface ParseIssue {
  line?: number;
  column?: string;
  message: string;
}

export type ParseResult =
  | { ok: true; dataset: Dataset }
  | { ok: false; errors: ParseIssue[] };

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_REPORTED_ERRORS = 8;

/** Tokens that mean "no value" in exported wellness data. */
const MISSING_TOKENS = new Set(["", "na", "n/a", "nan", "null", "none", "-"]);

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NUMBER_RE = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

export function isValidIsoDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Splits one CSV line, honouring double-quoted fields. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseWellnessCsv(text: string, fileName = "data.csv"): ParseResult {
  const errors: ParseIssue[] = [];
  const fail = (): ParseResult => ({
    ok: false,
    errors: errors.length > MAX_REPORTED_ERRORS
      ? [...errors.slice(0, MAX_REPORTED_ERRORS), { message: `…and ${errors.length - MAX_REPORTED_ERRORS} more problems.` }]
      : errors,
  });

  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r\n|\n|\r/);
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();

  if (lines.length === 0 || lines.every((l) => l.trim() === "")) {
    return { ok: false, errors: [{ message: "The file is empty." }] };
  }

  const header = splitLine(lines[0]).map((h) => h.toLowerCase());
  const missingCols = EXPECTED_COLUMNS.filter((c) => !header.includes(c));
  const dupCols = header.filter((h, i) => h && header.indexOf(h) !== i);
  if (missingCols.length) {
    errors.push({ line: 1, message: `Missing expected column${missingCols.length > 1 ? "s" : ""}: ${missingCols.join(", ")}.` });
  }
  if (dupCols.length) errors.push({ line: 1, message: `Duplicate column${dupCols.length > 1 ? "s" : ""}: ${[...new Set(dupCols)].join(", ")}.` });
  if (errors.length) return fail();

  const warnings: string[] = [];
  const extra = header.filter((h) => h && !EXPECTED_COLUMNS.includes(h));
  if (extra.length) warnings.push(`Ignored column${extra.length > 1 ? "s" : ""} not used by Rova: ${extra.join(", ")}.`);

  const idx = Object.fromEntries(EXPECTED_COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<string, number>;
  const days: DayRecord[] = [];
  const seen = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1;
    if (lines[i].trim() === "") continue;
    const cells = splitLine(lines[i]);
    if (cells.length !== header.length) {
      errors.push({ line: lineNo, message: `Expected ${header.length} values but found ${cells.length}.` });
      continue;
    }

    const date = cells[idx[DATE_COLUMN]];
    if (!date) { errors.push({ line: lineNo, column: DATE_COLUMN, message: "Date is empty." }); continue; }
    if (!isValidIsoDate(date)) {
      errors.push({ line: lineNo, column: DATE_COLUMN, message: `"${date}" is not a valid date. Use YYYY-MM-DD.` });
      continue;
    }
    if (seen.has(date)) {
      errors.push({ line: lineNo, column: DATE_COLUMN, message: `${date} appears more than once (also on line ${seen.get(date)}).` });
      continue;
    }
    seen.set(date, lineNo);

    const values = {} as Record<FieldKey, Cell>;
    for (const key of Object.keys(FIELDS) as FieldKey[]) {
      const raw = cells[idx[key]];
      if (MISSING_TOKENS.has(raw.toLowerCase())) { values[key] = null; continue; }
      if (!NUMBER_RE.test(raw)) {
        errors.push({ line: lineNo, column: key, message: `"${raw}" is not a number.` });
        values[key] = null;
        continue;
      }
      const value = Number(raw);
      if (FIELDS[key].nonNegative && value < 0) {
        errors.push({ line: lineNo, column: key, message: `${raw} is negative, which isn't possible for ${FIELDS[key].label.toLowerCase()}.` });
      }
      // Normalise -0 so "-0.0" is shown as 0.0; the value itself is unchanged.
      values[key] = { value: Object.is(value, -0) ? 0 : value, raw };
    }
    days.push({ date, line: lineNo, values });
  }

  if (errors.length) return fail();
  if (days.length === 0) return { ok: false, errors: [{ message: "The file has a header but no data rows." }] };

  // Chronological order for display; the values themselves are untouched.
  days.sort((a, b) => a.date.localeCompare(b.date));

  const missing: MissingCell[] = [];
  for (const d of days) {
    for (const key of Object.keys(FIELDS) as FieldKey[]) if (d.values[key] === null) missing.push({ date: d.date, field: key });
  }

  const absentDates: string[] = [];
  const present = new Set(days.map((d) => d.date));
  for (let dt = days[0].date; dt <= days[days.length - 1].date; dt = addDays(dt, 1)) {
    if (!present.has(dt)) absentDates.push(dt);
  }
  if (absentDates.length) warnings.push(`${absentDates.length} day${absentDates.length > 1 ? "s have" : " has"} no row in the file and ${absentDates.length > 1 ? "are" : "is"} shown as gaps.`);

  return {
    ok: true,
    dataset: { fileName, days, firstDate: days[0].date, lastDate: days[days.length - 1].date, missing, absentDates, warnings },
  };
}
