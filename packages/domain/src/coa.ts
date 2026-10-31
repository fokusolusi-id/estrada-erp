import type { Category } from "./budget";
import type { Money } from "./money";

export interface Variance {
  amount: Money;
  /** Percent change; null when there is no base to compare with. */
  pct: Money | null;
}

/** The 2027 plan against a 2026 figure (RKA or Actual), as the division sheets show beside each line. */
export function variance(plan: Money, base: Money | null): Variance {
  if (!base) return { amount: plan, pct: null };
  return { amount: plan.minus(base), pct: base.isZero() ? null : plan.minus(base).div(base).times(100) };
}

export type RemapProblem =
  | "source_not_provisional"
  | "target_missing"
  | "same_code"
  | "target_inactive"
  | "target_provisional"
  | "category_mismatch"
  | "locked_lines";

/**
 * Whether Finance may move every line off a provisional code onto an existing one. Only provisional codes are
 * remapped (a COA Master code keeps its history), the category must match so totals stay in their rows,
 * and lines in a locked version never change.
 */
export function remapProblem(
  source: { code: string; category: Category; provisional: boolean },
  target: { code: string; category: Category; active: boolean; provisional: boolean } | undefined,
  lockedLines: number,
): RemapProblem | null {
  if (!source.provisional) return "source_not_provisional";
  if (!target) return "target_missing";
  if (target.code === source.code) return "same_code";
  if (!target.active) return "target_inactive";
  if (target.provisional) return "target_provisional";
  if (target.category !== source.category) return "category_mismatch";
  if (lockedLines > 0) return "locked_lines";
  return null;
}
