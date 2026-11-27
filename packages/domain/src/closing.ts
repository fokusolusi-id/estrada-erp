/** Monthly closing (plan B7; sheets FC07_Finance step 9, FC09_Reporting; BR-RPT-003, BR-FIN-005, BR-FIN-008). */
import type { Category } from "./budget";
import { sum, type Money } from "./money";

/** The totals Accounting types each month (client decision 4). */
export interface BalanceTotals {
  currentAssets: Money;
  totalAssets: Money;
  currentLiabilities: Money;
  totalLiabilities: Money;
  equity: Money;
}

export function balanceProblem(b: BalanceTotals): "negative" | "current" | null {
  if ([b.currentAssets, b.totalAssets, b.currentLiabilities, b.totalLiabilities].some((v) => v.isNegative())) return "negative";
  return b.currentAssets.gt(b.totalAssets) || b.currentLiabilities.gt(b.totalLiabilities) ? "current" : null;
}

/** A month closes only with its totals typed and assets equal to liabilities plus equity. */
export function closingProblem(b: BalanceTotals | null): "missing" | "unbalanced" | null {
  if (!b) return "missing";
  return b.totalAssets.eq(b.totalLiabilities.plus(b.equity)) ? null : "unbalanced";
}

export interface PnlLine {
  /** Empty for invoice revenue, costs without an account and loan interest. */
  coaCode: string;
  name: string;
  category: Category;
  amount: Money;
}

/**
 * A company's month: revenue from the invoices issued in it, costs paid or accrued in it by account, and loan interest.
 * Capital spending and balance sheet accounts are not profit and loss.
 */
export function monthPnl(input: {
  revenue: readonly Money[];
  costs: readonly { coaCode: string | null; amount: Money }[];
  interest: readonly Money[];
  accounts: ReadonlyMap<string, { name: string; category: Category }>;
}) {
  const lines: PnlLine[] = [];
  if (input.revenue.length) lines.push({ coaCode: "", name: "Pendapatan (invoice terbit)", category: "Revenue", amount: sum([...input.revenue]) });
  const codes = [...new Set(input.costs.map((c) => c.coaCode ?? ""))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  for (const coaCode of codes) {
    const account = input.accounts.get(coaCode);
    const category = account?.category ?? "OTHERS";
    if (category === "CAPEX" || category === "BALANCE_SHEET") continue;
    lines.push({ coaCode, name: account?.name ?? "Biaya tanpa akun", category, amount: sum(input.costs.filter((c) => (c.coaCode ?? "") === coaCode).map((c) => c.amount)) });
  }
  if (input.interest.length) lines.push({ coaCode: "", name: "Bunga pinjaman", category: "OTHERS", amount: sum([...input.interest]) });
  const revenue = sum(lines.filter((l) => l.category === "Revenue").map((l) => l.amount));
  const cost = sum(lines.filter((l) => l.category !== "Revenue").map((l) => l.amount));
  return { lines, revenue, cost, profit: revenue.minus(cost) };
}
