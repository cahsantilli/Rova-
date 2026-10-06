import type { Dataset } from "../domain/parse";
import { FIELDS, METRICS, type FieldKey, type MetricSpec } from "../domain/schema";
import { summarize, type FieldSummary } from "../domain/stats";
import { dayDate, formatValue, shortDate } from "../domain/format";
import { Chart, RangeBar, RangeKey, Sparkline } from "./Chart";
import { connectionsFor } from "../domain/insights";
import { outsideUsual } from "../domain/patterns";
import { StatusChip } from "./Status";

/** Reads the usual range as a short phrase, e.g. "48–57 ms". */
function rangeText(s: FieldSummary): string {
  if (!s.usual) return "";
  const unit = FIELDS[s.field].unit;
  const lo = formatValue(s.field, s.usual.low).replace(unit ? ` ${unit}` : "", "");
  // Keep the range on one line: "48–57 ms".
  return `${lo}\u2060–\u2060${formatValue(s.field, s.usual.high).replace(" ", "\u00a0")}`;
}

function recentSentence(s: FieldSummary): string {
  if (s.recentAvg === null) return "There are no readings in the last 7 days.";
  const avg = formatValue(s.field, s.recentAvg, 1);
  const partial = s.recentAvailable < s.recentWindowDays ? ` (${s.recentAvailable} of ${s.recentWindowDays} days had a reading)` : "";
  switch (s.status) {
    case "within": return `Your last 7 days averaged ${avg}${partial}, within your usual range of ${rangeText(s)}.`;
    case "above": return `Your last 7 days averaged ${avg}${partial}, above your usual range of ${rangeText(s)}.`;
    case "below": return `Your last 7 days averaged ${avg}${partial}, below your usual range of ${rangeText(s)}.`;
    default: return `Your last 7 days averaged ${avg}${partial}. There aren't enough readings yet to know your usual range.`;
  }
}

export function MetricView({ ds, metric, ask }: { ds: Dataset; metric: MetricSpec; ask?: React.ReactNode }) {
  const s = summarize(ds, metric.primary);
  const second = metric.secondary ? summarize(ds, metric.secondary) : null;
  const periodDays = s.series.length;
  const idx = METRICS.findIndex((m) => m.id === metric.id);
  const next = METRICS[(idx + 1) % METRICS.length];

  return (
    <article className="detail" aria-labelledby="metric-title">
      <a className="back" href="#overview">← Overview</a>

      {/* 1. Current value, read against the person's own baseline */}
      <header className="detail-head">
        <h1 id="metric-title" className="eyebrow">{metric.name}</h1>
        <p className="detail-value">
          <span className="value">{formatValue(s.field, s.latest?.value ?? null)}</span>
          <span className="detail-when">
            {FIELDS[s.field].label !== metric.name && `${FIELDS[s.field].label} · `}
            {s.latest ? (s.latestIsStale ? `last reading ${dayDate(s.latest.date)}` : dayDate(s.latest.date)) : "no readings"}
          </span>
        </p>
        <p className="detail-sentence">{recentSentence(s)}</p>
        <div className="detail-status">
          <StatusChip status={s.status} />
          <RangeBar summary={s} width={200} />
        </div>
        {s.usual && <RangeKey />}
      </header>

      {/* 2. Historical context */}
      <section className="detail-section history" aria-label="History">
        <Chart
          points={s.series}
          field={s.field}
          kind={metric.chart}
          band={s.usual}
          recentDays={7}
          height={230}
          label={`${FIELDS[s.field].label}, daily values from ${shortDate(s.series[0].date)} to ${shortDate(s.series[periodDays - 1].date)}`}
        />
        <p className="legend">
          <span className="legend-band" aria-hidden="true" /> Your usual range
          {s.usual && outsideUsual(s).length > 0 && <span className="legend-sep"><span className="legend-outside" aria-hidden="true" /> Outside it</span>}
          {s.periodMin && s.periodMax && <span className="legend-sep">Lowest {formatValue(s.field, s.periodMin.value)} on {shortDate(s.periodMin.date)}, highest {formatValue(s.field, s.periodMax.value)} on {shortDate(s.periodMax.date)}</span>}
          {s.missingDates.length > 0 && (
            <span className="legend-sep"><span className="legend-missing" aria-hidden="true" /> No reading on {s.missingDates.map(shortDate).join(", ")}</span>
          )}
        </p>

        {second && (
          <div className="companion">
            <div className="companion-text">
              <span className="companion-label">{FIELDS[second.field].label}</span>
              <span className="companion-value">{formatValue(second.field, second.latest?.value ?? null)}</span>
              <span className="companion-sub">7-day average {formatValue(second.field, second.recentAvg, 1)}</span>
            </div>
            <StatusChip status={second.status} />
            <Sparkline points={second.series} band={second.usual} width={150} height={40} />
          </div>
        )}
      </section>

      {/* 3. In context: what stood out and what moved with it */}
      <InContext ds={ds} metric={metric} s={s} />

      {/* 4. Simple explanation */}
      <section className="detail-section explain">
        <h2>About {metric.name === metric.name.toUpperCase() ? metric.name : metric.name.toLowerCase()}</h2>
        <p>{metric.about}</p>
        <p className="muted">Your usual range is where most of your days fell across these {periodDays} days (your average, give or take one standard deviation).</p>
      </section>

      {/* 5. Ask about this metric */}
      {ask}

      <details className="daily">
        <summary>Daily values</summary>
        <DailyTable ds={ds} fields={[metric.primary, ...(metric.secondary ? [metric.secondary] : [])]} />
      </details>

      <a className="next" href={`#${next.id}`}>Next: {next.name} →</a>
    </article>
  );
}

function InContext({ ds, metric, s }: { ds: Dataset; metric: MetricSpec; s: FieldSummary }) {
  const out = outsideUsual(s);
  const links = connectionsFor(ds, metric);
  if (!s.usual) return null;
  const listed = out.slice(0, 8).map((o) => `${shortDate(o.date)} (${formatValue(s.field, o.value)})`);
  return (
    <section className="detail-section context" aria-labelledby="context-title">
      <h2 id="context-title" className="block-title">In context</h2>
      <p>
        {out.length === 0
          ? `Every reading this month stayed within your usual range of ${rangeText(s)}.`
          : `${out.length} of ${s.available} readings were outside your usual range: ${listed.join(", ")}${out.length > listed.length ? ", and more" : ""}.`}
      </p>
      {links.map(({ stretch, others }) => others.length > 0 && (
        <p key={stretch.first}>
          From {shortDate(stretch.first)} to {shortDate(stretch.last)} it moved together with other measures: {others.join(", ")}.{" "}
          <span className="muted">That they coincided doesn't show that one caused another.</span>
        </p>
      ))}
    </section>
  );
}

function DailyTable({ ds, fields }: { ds: Dataset; fields: FieldKey[] }) {
  const rows = fields.map((f) => summarize(ds, f).series);
  const dates = rows[0].map((p) => p.date).reverse();
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {fields.map((f) => <th scope="col" key={f}>{FIELDS[f].label}</th>)}
          </tr>
        </thead>
        <tbody>
          {dates.map((d) => (
            <tr key={d}>
              <th scope="row">{dayDate(d)}</th>
              {rows.map((series, fi) => {
                const v = series.find((p) => p.date === d)!.value;
                return <td key={fi} className={v === null ? "missing" : undefined}>{v === null ? "No reading" : formatValue(fields[fi], v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
