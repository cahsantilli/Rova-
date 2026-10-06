import { useState } from "react";
import type { Dataset } from "../domain/parse";
import { FIELDS, type FieldKey, type MetricSpec } from "../domain/schema";
import { summarize, type FieldSummary } from "../domain/stats";
import { dayDate, formatDelta, formatValue, shortDate } from "../domain/format";
import { Chart } from "./Chart";

export function MetricView({ ds, metric, aside }: { ds: Dataset; metric: MetricSpec; aside?: React.ReactNode }) {
  const primary = summarize(ds, metric.primary);
  const secondary = metric.secondary ? summarize(ds, metric.secondary) : null;
  const periodDays = primary.series.length;

  return (
    <section className="metric" aria-labelledby="metric-title">
      <header className="view-head">
        <h2 id="metric-title">{metric.name}</h2>
        <p className="muted">{metric.about}</p>
      </header>

      <FieldBlock s={primary} kind={metric.chart} periodDays={periodDays} lead />
      {secondary && <FieldBlock s={secondary} kind={metric.secondary === "training_duration_min" ? "bar" : "line"} periodDays={periodDays} />}

      {aside}

      <History ds={ds} fields={[metric.primary, ...(metric.secondary ? [metric.secondary] : [])]} />
    </section>
  );
}

function FieldBlock({ s, kind, periodDays, lead = false }: { s: FieldSummary; kind: "line" | "bar"; periodDays: number; lead?: boolean }) {
  const spec = FIELDS[s.field];
  return (
    <div className={`field-block${lead ? " is-lead" : ""}`}>
      <div className="field-head">
        <div>
          <p className="field-label">{spec.label}</p>
          <p className="field-latest">
            <span className="value">{formatValue(s.field, s.latest?.value ?? null)}</span>
            <span className="muted small">
              {s.latest ? (s.latestIsStale ? `last reading, ${dayDate(s.latest.date)}` : dayDate(s.latest.date)) : "no readings"}
            </span>
          </p>
        </div>
        <dl className="stats">
          <div>
            <dt>Last 7 days</dt>
            <dd>{formatValue(s.field, s.recentAvg, 1)}<span className="muted small"> avg{s.recentAvailable < s.recentWindowDays ? ` · ${s.recentAvailable} of ${s.recentWindowDays} days` : ""}</span></dd>
          </div>
          <div>
            <dt>{periodDays}-day average</dt>
            <dd>{formatValue(s.field, s.periodAvg, 1)}{s.available < periodDays && <span className="muted small"> · {s.available} of {periodDays} days</span>}</dd>
          </div>
          <div>
            <dt>Difference</dt>
            <dd>{s.recentDelta !== null ? formatDelta(s.field, s.recentDelta) : "—"}</dd>
          </div>
          <div>
            <dt>Range</dt>
            <dd>
              {s.periodMin && s.periodMax ? (
                <>
                  {formatValue(s.field, s.periodMin.value)} – {formatValue(s.field, s.periodMax.value)}
                  <span className="muted small block">low {shortDate(s.periodMin.date)}, high {shortDate(s.periodMax.date)}</span>
                </>
              ) : "—"}
            </dd>
          </div>
        </dl>
      </div>
      <Chart
        points={s.series}
        field={s.field}
        kind={kind}
        average={s.periodAvg}
        recentDays={7}
        height={lead ? 240 : 170}
        label={`${spec.label}, daily values from ${shortDate(s.series[0].date)} to ${shortDate(s.series[s.series.length - 1].date)}`}
      />
      <p className="legend muted small">
        <span className="legend-avg" aria-hidden="true" /> your {periodDays}-day average
        {s.missingDates.length > 0 && (
          <>
            <span className="legend-missing" aria-hidden="true" /> no reading ({s.missingDates.map(shortDate).join(", ")})
          </>
        )}
      </p>
    </div>
  );
}

function History({ ds, fields }: { ds: Dataset; fields: FieldKey[] }) {
  const [expanded, setExpanded] = useState(false);
  const rows = fields.map((f) => summarize(ds, f).series);
  const dates = rows[0].map((p) => p.date).reverse();
  const shown = expanded ? dates : dates.slice(0, 7);
  const valueFor = (fi: number, date: string) => rows[fi].find((p) => p.date === date)!.value;

  return (
    <div className="history">
      <h3>Daily history</h3>
      <table>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {fields.map((f) => <th scope="col" key={f}>{FIELDS[f].label}</th>)}
          </tr>
        </thead>
        <tbody>
          {shown.map((d) => (
            <tr key={d}>
              <th scope="row">{dayDate(d)}</th>
              {fields.map((f, fi) => {
                const v = valueFor(fi, d);
                return <td key={f} className={v === null ? "missing" : undefined}>{v === null ? "No reading" : formatValue(f, v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {dates.length > 7 && (
        <button className="button ghost" onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show last 7 days" : `Show all ${dates.length} days`}
        </button>
      )}
    </div>
  );
}
