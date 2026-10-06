import { useLayoutEffect, useRef, useState } from "react";
import type { FieldSummary, Point } from "../domain/stats";
import { FIELDS, type FieldKey } from "../domain/schema";
import { dayDate, formatNumber, formatValue, shortDate } from "../domain/format";

interface ChartProps {
  points: Point[];
  field: FieldKey;
  kind: "line" | "bar";
  /** The person's usual range, drawn as a soft band. */
  band: { low: number; high: number } | null;
  /** Number of trailing days to tint as "recent". */
  recentDays?: number;
  height?: number;
  label: string;
}

const PAD = { top: 22, right: 8, bottom: 26, left: 34 };

/** Round-number step (1, 2, 2.5 or 5 × 10^k) giving about `target` gridlines. */
function niceStep(range: number, target = 3): number {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
}

function ticks(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Number(t.toFixed(6)));
  return out;
}

function stepDecimals(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
}

export function Chart({ points, field, kind, band, recentDays = 0, height = 220, label }: ChartProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  if (values.length === 0) {
    return <div className="chart-empty">No readings in this period.</div>;
  }

  const includeZero = kind === "bar" || field === "temperature_deviation_c";
  let lo = Math.min(...values, ...(band ? [band.low] : []), ...(includeZero ? [0] : []));
  let hi = Math.max(...values, ...(band ? [band.high] : []), ...(includeZero ? [0] : []));
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12;
  if (!(kind === "bar" && lo >= 0)) lo -= pad;
  hi += pad;
  const step = niceStep(hi - lo);
  const tickDecimals = stepDecimals(step);

  const innerW = width - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const n = points.length;
  const slot = innerW / n;
  const x = (i: number) => PAD.left + slot * i + slot / 2;
  const y = (v: number) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;

  // Line segments break at missing days rather than bridging them.
  const segments: string[] = [];
  let cur = "";
  points.forEach((p, i) => {
    if (p.value === null) {
      if (cur) segments.push(cur);
      cur = "";
    } else {
      cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
    }
  });
  if (cur) segments.push(cur);

  const lastIdx = points.map((p) => p.value !== null).lastIndexOf(true);
  const recentStart = recentDays > 0 ? n - Math.min(recentDays, n) : n;
  const xTickIdx = points.map((_, i) => i).filter((i) => i === 0 || i === n - 1 || (i % 7 === 0 && n - 1 - i > 3));
  const hp = hover !== null ? points[hover] : null;
  const barW = Math.max(2, Math.min(14, slot * 0.5));
  const zeroY = y(Math.max(lo, 0));
  const tickExtra = Math.max(0, tickDecimals - FIELDS[field].decimals);

  return (
    <div className="chart" ref={wrap}>
      <svg width={width} height={height} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        {recentStart < n && (
          <g>
            <rect className="chart-recent" x={PAD.left + slot * recentStart} y={PAD.top - 18} width={slot * (n - recentStart)} height={innerH + 18} rx={8} />
            <text className="chart-recent-label" x={PAD.left + slot * (recentStart + (n - recentStart) / 2)} y={PAD.top - 6} textAnchor="middle">Last 7 days</text>
          </g>
        )}
        {band && <rect className="chart-band" x={PAD.left} y={y(band.high)} width={innerW} height={Math.max(1, y(band.low) - y(band.high))} />}
        {ticks(lo, hi, step).map((t) => (
          <text key={t} className="chart-axis" x={PAD.left - 8} y={y(t) + 4} textAnchor="end">{formatNumber(field, t, tickExtra)}</text>
        ))}
        {includeZero && kind === "line" && <line className="chart-zero" x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} />}
        {points.map((p, i) =>
          p.value === null ? (
            <line key={p.date} className="chart-missing" x1={x(i)} x2={x(i)} y1={PAD.top + 6} y2={PAD.top + innerH} />
          ) : null,
        )}
        {kind === "line" ? (
          <g>
            {segments.map((d, i) => <path key={i} className="chart-line" d={d} />)}
            {band && points.map((p, i) => p.value !== null && (p.value > band.high || p.value < band.low) && i !== hover && (
              <circle key={`o${p.date}`} className="chart-outside" cx={x(i)} cy={y(p.value)} r={3.5} />
            ))}
            {hover !== null && hp?.value != null && <circle className="chart-dot is-active" cx={x(hover)} cy={y(hp.value)} r={4.5} />}
            {lastIdx >= 0 && hover !== lastIdx && <circle className="chart-dot is-last" cx={x(lastIdx)} cy={y(points[lastIdx].value!)} r={4} />}
          </g>
        ) : (
          <g>
            {points.map((p, i) => p.value !== null && (
              <rect
                key={p.date}
                className={`chart-bar${hover === i ? " is-active" : ""}${i >= recentStart ? " is-recent" : ""}${band && (p.value > band.high || p.value < band.low) ? " is-outside" : ""}`}
                x={x(i) - barW / 2}
                y={Math.min(y(p.value), zeroY)}
                width={barW}
                height={Math.max(1, Math.abs(zeroY - y(p.value)))}
                rx={barW / 2}
              />
            ))}
          </g>
        )}
        {xTickIdx.map((i) => (
          <text key={i} className="chart-axis" x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} dx={i === 0 ? -slot / 2 : i === n - 1 ? slot / 2 : 0}>
            {shortDate(points[i].date)}
          </text>
        ))}
        {hover !== null && <line className="chart-cursor" x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} />}
        {points.map((p, i) => (
          <rect key={p.date} x={PAD.left + slot * i} y={0} width={slot} height={height} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      {hp && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(hover!), 70), width - 70) }}>
          <span className="chart-tip-date">{dayDate(hp.date)}</span>
          <span className={hp.value === null ? "chart-tip-missing" : "chart-tip-value"}>{hp.value === null ? "No reading" : formatValue(field, hp.value)}</span>
        </div>
      )}
    </div>
  );
}

/** Small trend line for tiles. No axes, no interaction. */
export function Sparkline({ points, band, width = 132, height = 36 }: { points: Point[]; band?: { low: number; high: number } | null; width?: number; height?: number }) {
  const vals = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  if (vals.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const lo = Math.min(...vals, ...(band ? [band.low] : []));
  const hi = Math.max(...vals, ...(band ? [band.high] : []));
  const span = hi - lo || 1;
  const x = (i: number) => 3 + (i / (points.length - 1)) * (width - 6);
  const y = (v: number) => 4 + (1 - (v - lo) / span) * (height - 8);
  let d = "";
  let pen = false;
  points.forEach((p, i) => {
    if (p.value === null) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
    pen = true;
  });
  const li = points.map((p) => p.value !== null).lastIndexOf(true);
  return (
    <svg width={width} height={height} className="spark" aria-hidden="true" viewBox={`0 0 ${width} ${height}`}>
      {band && <rect className="spark-band" x={0} y={y(band.high)} width={width} height={Math.max(1, y(band.low) - y(band.high))} rx={3} />}
      <path d={d} />
      <circle cx={x(li)} cy={y(points[li].value!)} r={3} />
    </svg>
  );
}

/**
 * Where one figure sits against the person's baseline: a track spanning the month's lowest to highest
 * reading, the usual range as a soft band, the month average as a tick and the last 7 days as a point.
 */
export function RangeBar({ summary: s, width = 168 }: { summary: FieldSummary; width?: number }) {
  if (!s.usual || s.recentAvg === null || s.periodAvg === null || !s.periodMin || !s.periodMax) return null;
  const lo = Math.min(s.periodMin.value!, s.usual.low);
  const hi = Math.max(s.periodMax.value!, s.usual.high);
  const span = hi - lo || 1;
  const pad = 6;
  const x = (v: number) => pad + ((v - lo) / span) * (width - pad * 2);
  const label = `Last 7 days ${formatValue(s.field, s.recentAvg, 1)}; usual range ${formatValue(s.field, s.usual.low, 1)} to ${formatValue(s.field, s.usual.high, 1)}; month average ${formatValue(s.field, s.periodAvg, 1)}`;
  return (
    <svg className="rangebar" width={width} height={22} viewBox={`0 0 ${width} 22`} role="img" aria-label={label}>
      <title>{label}</title>
      <line className="rangebar-track" x1={pad} x2={width - pad} y1={11} y2={11} />
      <rect className="rangebar-band" x={x(s.usual.low)} y={6} width={Math.max(2, x(s.usual.high) - x(s.usual.low))} height={10} rx={5} />
      <line className="rangebar-avg" x1={x(s.periodAvg)} x2={x(s.periodAvg)} y1={4} y2={18} />
      <circle className="rangebar-dot" cx={x(s.recentAvg)} cy={11} r={5} />
    </svg>
  );
}

/**
 * Several measures on one timeline: a dot per day, filled where that day's reading sat outside the
 * person's usual range. The highlighted window is the stretch when they moved together.
 */
export function PatternStrip({ summaries, window: win }: { summaries: FieldSummary[]; window: { first: string; last: string } }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const n = summaries[0].series.length;
  const labelW = width < 520 ? 0 : 168;
  const rowH = width < 520 ? 38 : 26;
  const top = 6;
  const slot = (width - labelW) / n;
  const cx = (i: number) => labelW + slot * i + slot / 2;
  const firstIdx = summaries[0].series.findIndex((p) => p.date === win.first);
  const lastIdx = summaries[0].series.findIndex((p) => p.date === win.last);
  const height = top + rowH * summaries.length + 22;
  const r = Math.max(2.5, Math.min(4, slot * 0.3));
  return (
    <div className="strip" ref={wrap}>
      <svg width={width} height={height} role="img" aria-label={`Days each measure was outside your usual range, ${shortDate(summaries[0].series[0].date)} to ${shortDate(summaries[0].series[n - 1].date)}. Highlighted: ${shortDate(win.first)} to ${shortDate(win.last)}.`}>
        <rect className="strip-window" x={labelW + slot * firstIdx} y={0} width={slot * (lastIdx - firstIdx + 1)} height={height - 18} rx={8} />
        {summaries.map((s, row) => {
          const yMid = top + rowH * row + (width < 520 ? 24 : rowH / 2);
          return (
            <g key={s.field}>
              <text className="strip-label" x={width < 520 ? 0 : 0} y={width < 520 ? yMid - 13 : yMid + 4}>{FIELDS[s.field].label}</text>
              {s.series.map((p, i) => {
                const out = s.usual && p.value !== null && (p.value > s.usual.high || p.value < s.usual.low);
                const tip = `${shortDate(p.date)} · ${FIELDS[s.field].label} ${p.value === null ? "no reading" : formatValue(s.field, p.value)}${out ? (p.value! > s.usual!.high ? " (higher than usual)" : " (lower than usual)") : ""}`;
                return p.value === null ? (
                  <circle key={p.date} className="strip-missing" cx={cx(i)} cy={yMid} r={r - 0.5}><title>{tip}</title></circle>
                ) : (
                  <circle key={p.date} className={out ? "strip-dot is-out" : "strip-dot"} cx={cx(i)} cy={yMid} r={out ? r : r * 0.55}><title>{tip}</title></circle>
                );
              })}
            </g>
          );
        })}
        <text className="chart-axis" x={labelW} y={height - 4}>{shortDate(summaries[0].series[0].date)}</text>
        <text className="chart-axis" x={labelW + slot * ((firstIdx + lastIdx + 1) / 2)} y={height - 4} textAnchor="middle">{shortDate(win.first)} – {shortDate(win.last)}</text>
        <text className="chart-axis" x={width} y={height - 4} textAnchor="end">{shortDate(summaries[0].series[n - 1].date)}</text>
      </svg>
      <p className="strip-legend">
        <span className="strip-key is-out" aria-hidden="true" /> Outside your usual range
        <span className="strip-key" aria-hidden="true" /> Within it
      </p>
    </div>
  );
}

/** Explains the RangeBar marks once per section. */
export function RangeKey() {
  return (
    <p className="range-key" aria-hidden="true">
      <span><i className="k-dot" /> Last 7 days</span>
      <span><i className="k-band" /> Your usual range</span>
      <span><i className="k-avg" /> Month average</span>
    </p>
  );
}
