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

/** A sale to, or a cost from, another company of the group. */
export interface IntercompanyAmount extends PnlLine {
  counterparty: string;
}

export interface PnlPosting {
  coaCode: string | null;
  amount: Money;
  /** The group company on the other side, when there is one. */
  counterparty?: string | null;
}

/**
 * A company's month: revenue from the invoices issued in it, costs paid or accrued in it by account, and loan interest.
 * Capital spending and balance sheet accounts are not profit and loss.
 */
export function monthPnl(input: {
  revenue: readonly PnlPosting[];
  costs: readonly PnlPosting[];
  interest: readonly Money[];
  accounts: ReadonlyMap<string, { name: string; category: Category }>;
}) {
  const lines: PnlLine[] = [];
  const intercompany: IntercompanyAmount[] = [];
  const add = (postings: readonly PnlPosting[], describe: (coaCode: string) => { name: string; category: Category }) => {
    const codes = [...new Set(postings.map((p) => p.coaCode ?? ""))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
    for (const coaCode of codes) {
      const { name, category } = describe(coaCode);
      if (category === "CAPEX" || category === "BALANCE_SHEET") continue;
      const here = postings.filter((p) => (p.coaCode ?? "") === coaCode);
      lines.push({ coaCode, name, category, amount: sum(here.map((p) => p.amount)) });
      for (const counterparty of [...new Set(here.flatMap((p) => (p.counterparty ? [p.counterparty] : [])))].sort()) {
        intercompany.push({ coaCode, name, category, counterparty, amount: sum(here.filter((p) => p.counterparty === counterparty).map((p) => p.amount)) });
      }
    }
  };
  add(input.revenue, (code) => ({ name: input.accounts.get(code)?.name ?? "Pendapatan (tanpa akun)", category: "Revenue" }));
  add(input.costs, (code) => input.accounts.get(code) ?? { name: "Biaya tanpa akun", category: "OTHERS" });
  if (input.interest.length) lines.push({ coaCode: "7220", name: "Bunga pinjaman", category: "OTHERS", amount: sum([...input.interest]) });
  const revenue = sum(lines.filter((l) => l.category === "Revenue").map((l) => l.amount));
  const cost = sum(lines.filter((l) => l.category !== "Revenue").map((l) => l.amount));
  return { lines, intercompany, revenue, cost, profit: revenue.minus(cost) };
}
