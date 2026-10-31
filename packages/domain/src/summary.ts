import type { Category } from "./budget";
import { sum, ZERO, type Money } from "./money";

export interface SummaryLine {
  category: Category;
  ownerUnit: string;
  entity: string;
  months: Money[];
}

export type PnlKey =
  | "Revenue"
  | "COGS"
  | "GrossProfit"
  | "OPEX"
  | "OperatingProfit"
  | "OTHERS"
  | "ProfitBeforeTax"
  | "CAPEX"
  | "TotalCost";

export interface PnlRow {
  key: PnlKey;
  months: Money[];
  total: Money;
  /** Computed from other rows, never typed. */
  derived: boolean;
}

const COST: readonly Category[] = ["COGS", "OPEX", "OTHERS", "CAPEX"];
const zeros = () => Array.from({ length: 12 }, () => ZERO);
const add = (a: Money[], b: readonly Money[]) => a.map((m, i) => m.plus(b[i] ?? ZERO));
const minus = (a: Money[], b: readonly Money[]) => a.map((m, i) => m.minus(b[i] ?? ZERO));

/**
 * The Management Summary as one grouping of budget lines. Total cost follows the workbook's Rekap:
 * COGS + OPEX + OTHERS + CAPEX, so every report reconciles to the same figure.
 */
export function pnl(lines: readonly SummaryLine[]): PnlRow[] {
  const by: Record<Category, Money[]> = { Revenue: zeros(), COGS: zeros(), OPEX: zeros(), OTHERS: zeros(), CAPEX: zeros() };
  for (const l of lines) by[l.category] = add(by[l.category], l.months);

  const gross = minus(by.Revenue, by.COGS);
  const operating = minus(gross, by.OPEX);
  const beforeTax = minus(operating, by.OTHERS);
  const totalCost = COST.reduce((acc, c) => add(acc, by[c]), zeros());

  const row = (key: PnlKey, months: Money[], derived = false): PnlRow => ({ key, months, total: sum(months), derived });
  return [
    row("Revenue", by.Revenue),
    row("COGS", by.COGS),
    row("GrossProfit", gross, true),
    row("OPEX", by.OPEX),
    row("OperatingProfit", operating, true),
    row("OTHERS", by.OTHERS),
    row("ProfitBeforeTax", beforeTax, true),
    row("CAPEX", by.CAPEX),
    row("TotalCost", totalCost, true),
  ];
}

export interface Contribution {
  key: string;
  revenue: Money;
  cost: Money;
  net: Money;
  lines: number;
}

/** Revenue, total cost and net per group (division, entity), in order of first appearance. */
export function contribution(lines: readonly SummaryLine[], keyOf: (l: SummaryLine) => string): Contribution[] {
  const out = new Map<string, Contribution>();
  for (const l of lines) {
    const key = keyOf(l);
    const acc = out.get(key) ?? { key, revenue: ZERO, cost: ZERO, net: ZERO, lines: 0 };
    const total = sum(l.months);
    if (l.category === "Revenue") acc.revenue = acc.revenue.plus(total);
    else acc.cost = acc.cost.plus(total);
    acc.net = acc.revenue.minus(acc.cost);
    acc.lines += 1;
    out.set(key, acc);
  }
  return [...out.values()];
}
