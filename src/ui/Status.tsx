import type { UsualStatus } from "../domain/stats";

const LABEL: Record<UsualStatus, string> = {
  within: "Within your usual range",
  above: "Higher than usual",
  below: "Lower than usual",
  unknown: "Not enough data yet",
};

const SHORT: Record<UsualStatus, string> = {
  within: "Usual",
  above: "Higher than usual",
  below: "Lower than usual",
  unknown: "Too few readings",
};

/** Neutral wording on purpose: "higher" or "lower" is never presented as good or bad. A dot plus words, never color alone. */
export function StatusChip({ status, short = false }: { status: UsualStatus; short?: boolean }) {
  return (
    <span className={`status status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {short ? SHORT[status] : LABEL[status]}
    </span>
  );
}
