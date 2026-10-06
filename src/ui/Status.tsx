import type { UsualStatus } from "../domain/stats";

const LABEL: Record<UsualStatus, string> = {
  within: "In your usual range",
  above: "Higher than usual",
  below: "Lower than usual",
  unknown: "Not enough data yet",
};

/** Neutral wording on purpose: "higher" or "lower" is never presented as good or bad. */
export function StatusChip({ status }: { status: UsualStatus }) {
  return <span className={`status status-${status}`}>{LABEL[status]}</span>;
}
