/** Variance commentary (plan E2; sheets 37_Variance_Analysis and 31_Process_Mining). */
import { money, ZERO, type Money } from "./money";
import type { OrgTree } from "./org";
import type { Actor } from "./policy";

export type VarianceSeverity = "ok" | "watch" | "investigate" | "escalate";
export const VARIANCE_LABEL: Record<VarianceSeverity, string> = { ok: "Wajar", watch: "Watch", investigate: "Investigate", escalate: "Escalate" };

const STATUS: Record<VarianceSeverity, string> = {
  ok: "dalam batas wajar",
  watch: "variance perlu dipantau",
  investigate: "variance perlu diinvestigasi",
  escalate: "variance signifikan butuh eskalasi BOD",
};
const ACTION = {
  under: "Underspend bisa indikasi project delay: konfirmasi dengan PIC.",
  over: "Periksa pendorong biaya sebelum pembayaran berikutnya.",
};

/** ±5% Watch, ±10% Investigate, ±15% Escalate. */
const severityOf = (percent: Money): VarianceSeverity => {
  const size = percent.abs();
  return size.gte(15) ? "escalate" : size.gte(10) ? "investigate" : size.gte(5) ? "watch" : "ok";
};

/** Actual against the budget to date; null when there is neither. Spending without budget counts as 100% over. */
export function varianceOf(budget: Money, actual: Money) {
  if (budget.isZero() && actual.isZero()) return null;
  const amount = actual.minus(budget);
  const percent = budget.isZero() ? money("100") : amount.div(budget).times(100);
  const severity = severityOf(percent);
  const direction: "over" | "under" = amount.gt(ZERO) ? "over" : "under";
  return {
    amount,
    percent,
    severity,
    direction,
    /** `figure` is the variance without its sign, already formatted for the reader. */
    sentence: (name: string, figure: string) =>
      `${name} ${direction === "over" ? "di atas" : "di bawah"} budget periode sebesar ${figure} (${percent.abs().toFixed(1).replace(".", ",")}%). Status: ${STATUS[severity]}.${severity === "ok" ? "" : ` ${ACTION[direction]}`}`,
  };
}

/** The root cause is the cost center owner's to write: the heads over the unit. */
export const canNoteVariance = (actor: Actor, unit: string, org: OrgTree): boolean =>
  (actor.role === "default_owner" || actor.role === "division_owner") && org.isWithin(unit, actor.orgUnit);
