import type { Dataset } from "../domain/parse";
import { FIELDS } from "../domain/schema";
import { summarizeWeek } from "../domain/summary";
import { strongestConnection, weekChanges, type Change } from "../domain/insights";
import { addDays } from "../domain/parse";
import { formatValue, shortDate } from "../domain/format";
import { PatternStrip, RangeBar, RangeKey, Sparkline } from "./Chart";
import { StatusChip } from "./Status";

interface OverviewProps {
  ds: Dataset;
  ask?: React.ReactNode;
  /** Sends a question to the Ask box; absent when Ask isn't available. */
  onAsk?: (question: string) => void;
}

/** "How am I doing?" → "What changed?" → "What might be connected?" → "Explore the details". */
export function Overview({ ds, ask, onAsk }: OverviewProps) {
  const week = summarizeWeek(ds);
  const weekStart = addDays(ds.lastDate, -6) < ds.firstDate ? ds.firstDate : addDays(ds.lastDate, -6);
  const changes = weekChanges(ds);
  const moved = changes.filter((c) => c.summary.status === "above" || c.summary.status === "below");
  const notable = (moved.length ? moved : changes.filter((c) => Math.abs(c.shift) >= 0.2)).slice(0, 3);
  const connection = strongestConnection(ds);
  const [featured, rest] = [changes.slice(0, 2), changes.slice(2)];

  return (
    <div className="home">
      <header className="hero" aria-labelledby="home-title">
        <p className="eyebrow">Your last 7 days · {shortDate(weekStart)} – {shortDate(ds.lastDate)}</p>
        <div className="hero-grid">
          <h1 id="home-title">{week.headline}</h1>
          <div className="hero-aside">
            <p className="hero-detail">{week.detail}</p>
            <ul className="glance" aria-label="Each metric this week">
              {week.states.map(({ metric: m, summary: s }) => (
                <li key={m.id}>
                  <a href={`#${m.id}`} className={`glance-item status-${s.status}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {m.name}
                    <span className="sr-only">: {s.status === "within" ? "within your usual range" : s.status === "unknown" ? "not enough data" : `${s.status === "above" ? "higher" : "lower"} than usual`}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </header>

      <section className="block" aria-labelledby="changed-title">
        <h2 id="changed-title" className="block-title">What changed</h2>
        <p className="block-lede">
          {moved.length
            ? "Compared with your own usual range, this week:"
            : notable.length
              ? "Nothing left your usual range. Compared with the rest of your month, these moved the most:"
              : "Nothing left your usual range, and every metric stayed close to its monthly average."}
        </p>
        {notable.length > 0 && (
          <ul className="changes">
            {notable.map((c) => <ChangeRow key={c.metric.id} c={c} />)}
          </ul>
        )}
        {notable.length > 0 && <RangeKey />}
      </section>

      <section className="block" aria-labelledby="connected-title">
        <h2 id="connected-title" className="block-title">What might be connected</h2>
        {connection ? (
          <>
            <p className="block-statement">
              From {shortDate(connection.first)} to {shortDate(connection.last)}, {numberWord(connection.fields.length)} of your measures left their usual range at the same time.
            </p>
            <PatternStrip summaries={connection.summaries} window={{ first: connection.first, last: connection.last }} />
            <div className="connected-foot">
              <p className="caveat">Measures moving on the same days doesn't show that one caused another.</p>
              {onAsk && (
                <button type="button" className="text-button" onClick={() => onAsk(`What happened between ${shortDate(connection.first)} and ${shortDate(connection.last)}?`)}>
                  Ask about these days →
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="block-lede">No stretch of days had several measures outside your usual range at the same time.</p>
        )}
      </section>

      {ask}

      <section className="block" aria-labelledby="explore-title">
        <h2 id="explore-title" className="block-title">Explore the details</h2>
        <ul className="featured" aria-label="Metrics that moved the most">
          {featured.map(({ metric: m, summary: s }) => (
            <li key={m.id}>
              <a className="feature" href={`#${m.id}`} data-testid={`overview-${m.id}`}>
                <span className="feature-name">{m.name}</span>
                <span className="feature-value">{formatValue(m.primary, s.latest?.value ?? null)}</span>
                <span className="feature-date">{latestLabel(m.primary, m.name, s)}</span>
                <Sparkline points={s.series} band={s.usual} width={320} height={56} />
                <StatusChip status={s.status} />
              </a>
            </li>
          ))}
        </ul>
        <ul className="index" aria-label="Other metrics">
          {rest.map(({ metric: m, summary: s }) => (
            <li key={m.id}>
              <a className="index-row" href={`#${m.id}`} data-testid={`overview-${m.id}`}>
                <span className="index-name">{m.name}</span>
                <span className="index-value">{formatValue(m.primary, s.latest?.value ?? null)}<span className="index-date">{latestLabel(m.primary, m.name, s)}</span></span>
                <Sparkline points={s.series} band={s.usual} width={110} height={30} />
                <StatusChip status={s.status} short />
              </a>
            </li>
          ))}
        </ul>
        <p className="method">
          Your usual range is where most of your days fell between {shortDate(ds.firstDate)} and {shortDate(ds.lastDate)}: your own
          average, give or take one standard deviation. Rova compares you with yourself, not with population averages.
        </p>
      </section>

      <DataNotes ds={ds} />
    </div>
  );
}

function numberWord(n: number): string {
  return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"][n] ?? String(n);
}

function latestLabel(field: Change["metric"]["primary"], name: string, s: Change["summary"]): string {
  const label = FIELDS[field].label.toLowerCase() !== name.toLowerCase() ? `${FIELDS[field].label}, ` : "";
  if (!s.latest) return `${label}no readings`;
  return `${label}${s.latestIsStale ? `last reading ${shortDate(s.latest.date)}` : shortDate(s.latest.date)}`;
}

function ChangeRow({ c }: { c: Change }) {
  const s = c.summary;
  const f = c.metric.primary;
  return (
    <li className="change">
      <a href={`#${c.metric.id}`} className="change-name">{c.metric.name}</a>
      <p className="change-words">
        {FIELDS[f].label} was {c.words}
        {s.recentAvg !== null && s.periodAvg !== null && (
          <span className="change-figures">
            {formatValue(f, s.recentAvg, 1)} on average this week · {formatValue(f, s.periodAvg, 1)} across the month
          </span>
        )}
      </p>
      <RangeBar summary={s} />
    </li>
  );
}

export function DataNotes({ ds }: { ds: Dataset }) {
  if (ds.missing.length === 0 && ds.warnings.length === 0) {
    return <p className="data-notes">Every metric has a reading for every day in this file.</p>;
  }
  return (
    <div className="data-notes">
      {ds.missing.length > 0 && (
        <p>
          {ds.missing.length} reading{ds.missing.length > 1 ? "s are" : " is"} missing from your file and shown as gaps, not zeros:{" "}
          {ds.missing.map((m, i) => (
            <span key={`${m.date}-${m.field}`}>
              {i > 0 && (i === ds.missing.length - 1 ? " and " : ", ")}
              {FIELDS[m.field].label.toLowerCase()} on {shortDate(m.date)}
            </span>
          ))}
          .
        </p>
      )}
      {ds.warnings.map((w) => <p key={w}>{w}</p>)}
    </div>
  );
}
