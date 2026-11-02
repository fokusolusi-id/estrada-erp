import { formatIdr, ZERO, type Money } from "./money";

/**
 * One position in a unit's headcount plan. The workbook typed these into Beban rekrutmen rows by hand
 * (position in the item, head count in the RKA 2026 column); here the plan builds the line's months.
 */
export interface HeadcountRow {
  position: string;
  count: number;
  /** 1 = January. Heads are costed from this month to December. */
  startMonth: number;
  /** Monthly cost of one head. */
  costPerHead: Money;
}

export type HeadcountField = "position" | "count" | "startMonth" | "costPerHead";
export type HeadcountProblem = "required" | "out_of_range" | "not_positive";

export const HEADCOUNT_MAX = 999;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function headcountMonths(row: HeadcountRow): Money[] {
  const monthly = row.costPerHead.times(row.count);
  return Array.from({ length: 12 }, (_, i) => (i + 1 >= row.startMonth ? monthly : ZERO));
}

export function headcountProblems(row: HeadcountRow): Partial<Record<HeadcountField, HeadcountProblem>> {
  const problems: Partial<Record<HeadcountField, HeadcountProblem>> = {};
  if (!row.position.trim()) problems.position = "required";
  if (!Number.isInteger(row.count) || row.count < 1 || row.count > HEADCOUNT_MAX) problems.count = "out_of_range";
  if (!Number.isInteger(row.startMonth) || row.startMonth < 1 || row.startMonth > 12) problems.startMonth = "out_of_range";
  if (!row.costPerHead.isPositive() || row.costPerHead.isZero()) problems.costPerHead = "not_positive";
  return problems;
}

/** The line's basis, written from the plan so reviewers see how the amount was built. */
export function headcountBasis(row: HeadcountRow): string {
  return `Rencana headcount: ${row.count} orang × ${formatIdr(row.costPerHead)} per bulan, mulai ${MONTH_SHORT[row.startMonth - 1]}`;
}
