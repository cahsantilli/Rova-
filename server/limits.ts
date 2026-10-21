// Keeps a public deployment from spending the owner's API budget without bound.
// Two caps, both in memory (they reset when the server restarts): questions per visitor per hour,
// and questions per day across everyone.

export interface AskLimits {
  perVisitorPerHour: number;
  perDay: number;
}

export function limitsFromEnv(env: NodeJS.ProcessEnv): AskLimits {
  const n = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : fallback);
  return { perVisitorPerHour: n(env.ROVA_HOURLY_LIMIT, 20), perDay: n(env.ROVA_DAILY_LIMIT, 300) };
}

export type LimitResult = { ok: true } | { ok: false; error: string };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function askLimiter(limits: AskLimits, now: () => number = Date.now) {
  const visitors = new Map<string, number[]>();
  let dayStart = now();
  let dayCount = 0;

  return function take(visitor: string): LimitResult {
    const t = now();
    if (t - dayStart >= DAY) { dayStart = t; dayCount = 0; visitors.clear(); }
    if (dayCount >= limits.perDay) return { ok: false, error: "Rova has answered all the questions it can today. Please try again tomorrow." };
    const recent = (visitors.get(visitor) ?? []).filter((at) => t - at < HOUR);
    if (recent.length >= limits.perVisitorPerHour) {
      visitors.set(visitor, recent);
      return { ok: false, error: "You've asked a lot of questions this hour. Please try again a little later." };
    }
    recent.push(t);
    visitors.set(visitor, recent);
    dayCount++;
    return { ok: true };
  };
}
