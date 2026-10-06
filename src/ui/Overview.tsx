import type { Dataset } from "../domain/parse";
import { FIELDS } from "../domain/schema";
import { summarizeWeek } from "../domain/summary";
import { addDays } from "../domain/parse";
import { formatValue, shortDate } from "../domain/format";
import { Sparkline } from "./Chart";
import { StatusChip } from "./Status";

export function Overview({ ds, ask }: { ds: Dataset; ask?: React.ReactNode }) {
  const week = summarizeWeek(ds);
  const weekStart = addDays(ds.lastDate, -6) < ds.firstDate ? ds.firstDate : addDays(ds.lastDate, -6);

  return (
    <section className="home" aria-labelledby="home-title">
      <header className="home-head">
        <p className="eyebrow">Your last 7 days · {shortDate(weekStart)} – {shortDate(ds.lastDate)}</p>
        <h1 id="home-title">{week.headline}</h1>
        <p className="home-detail">{week.detail}</p>
      </header>

      <ul className="tiles" aria-label="Your six metrics">
        {week.states.map(({ metric: m, summary: s }) => (
          <li key={m.id}>
            <a className="tile" href={`#${m.id}`} data-testid={`overview-${m.id}`}>
              <span className="tile-name">{m.name}</span>
              <span className="tile-value">{formatValue(m.primary, s.latest?.value ?? null)}</span>
              <span className="tile-date">
                {FIELDS[m.primary].label.toLowerCase() !== m.name.toLowerCase() ? `${FIELDS[m.primary].label}, ` : ""}
                {s.latest ? (s.latestIsStale ? `last reading ${shortDate(s.latest.date)}` : shortDate(s.latest.date)) : "no readings"}
              </span>
              <span className="tile-foot">
                <StatusChip status={s.status} />
                <Sparkline points={s.series} band={s.usual} />
              </span>
            </a>
          </li>
        ))}
      </ul>

      <p className="home-method">
        Your usual range is where most of your days fell between {shortDate(ds.firstDate)} and {shortDate(ds.lastDate)}. Rova compares
        you with yourself, not with population averages.
      </p>

      {ask}

      <DataNotes ds={ds} />
    </section>
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
