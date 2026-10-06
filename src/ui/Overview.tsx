import type { Dataset } from "../domain/parse";
import { METRICS, FIELDS, type MetricId } from "../domain/schema";
import { summarize } from "../domain/stats";
import { formatDelta, formatValue, shortDate } from "../domain/format";
import { Sparkline } from "./Chart";

export function Overview({ ds, onOpen }: { ds: Dataset; onOpen: (id: MetricId) => void }) {
  const periodDays = summarize(ds, "hrv_ms").series.length;
  return (
    <section className="overview" aria-labelledby="overview-title">
      <header className="view-head">
        <h2 id="overview-title">Your last {periodDays} days</h2>
        <p className="muted">Each metric's most recent reading, and how your last 7 days compare with your own {periodDays}-day average.</p>
      </header>

      <ul className="metric-list">
        {METRICS.map((m) => {
          const s = summarize(ds, m.primary);
          return (
            <li key={m.id}>
              <button className="metric-row" onClick={() => onOpen(m.id)} data-testid={`overview-${m.id}`}>
                <span className="metric-row-name">
                  <span className="metric-row-title">{m.name}</span>
                  {FIELDS[m.primary].label.toLowerCase() !== m.name.toLowerCase() && <span className="metric-row-field">{FIELDS[m.primary].label}</span>}
                </span>
                <span className="metric-row-value">
                  <span className="value">{formatValue(m.primary, s.latest?.value ?? null)}</span>
                  <span className="muted small">{s.latest ? (s.latestIsStale ? `Last reading ${shortDate(s.latest.date)}` : shortDate(s.latest.date)) : "No readings"}</span>
                </span>
                <span className="metric-row-compare">
                  {s.recentDelta !== null ? (
                    <>
                      <span className="delta">{formatDelta(m.primary, s.recentDelta)}</span>
                      <span className="muted small">7-day vs {periodDays}-day avg</span>
                    </>
                  ) : (
                    <span className="muted small">Not enough readings to compare</span>
                  )}
                </span>
                <span className="metric-row-spark"><Sparkline points={s.series} /></span>
                <span className="chevron" aria-hidden="true">›</span>
              </button>
            </li>
          );
        })}
      </ul>

      <DataNotes ds={ds} />
    </section>
  );
}

export function DataNotes({ ds }: { ds: Dataset }) {
  if (ds.missing.length === 0 && ds.warnings.length === 0) {
    return <p className="data-notes muted small">Every metric has a reading for every day in this file.</p>;
  }
  return (
    <div className="data-notes">
      <p className="data-notes-title">About this data</p>
      {ds.missing.length > 0 && (
        <p className="muted small">
          {ds.missing.length} reading{ds.missing.length > 1 ? "s are" : " is"} missing from the file and shown as gaps, not zeros:{" "}
          {ds.missing.map((m, i) => (
            <span key={`${m.date}-${m.field}`}>
              {i > 0 && (i === ds.missing.length - 1 ? " and " : ", ")}
              {FIELDS[m.field].label.toLowerCase()} on {shortDate(m.date)}
            </span>
          ))}
          .
        </p>
      )}
      {ds.warnings.map((w) => <p key={w} className="muted small">{w}</p>)}
    </div>
  );
}
