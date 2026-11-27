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
  // TAX and BALANCE_SHEET never carry RKA lines (validateLine refuses them), so they have no row here.
  const by: Record<Category, Money[]> = { Revenue: zeros(), COGS: zeros(), OPEX: zeros(), OTHERS: zeros(), CAPEX: zeros(), TAX: zeros(), BALANCE_SHEET: zeros() };
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
export function contribution<L extends SummaryLine>(lines: readonly L[], keyOf: (l: L) => string): Contribution[] {
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

export type TotalKind = "Revenue" | "Cost" | "CAPEX";
export const TOTAL_KIND_LABEL: Record<TotalKind, string> = { Revenue: "Pendapatan", Cost: "Biaya", CAPEX: "CAPEX" };

export interface KindTotal {
  kind: TotalKind;
  months: Money[];
  total: Money;
}

/** Totals of a mixed list of RKA lines. Revenue is never added to spending: COGS, OPEX and OTHERS make up Biaya. */
export function totalsByKind(lines: readonly { category: Category; months: Money[] }[]): KindTotal[] {
  const kindOf = (c: Category): TotalKind => (c === "Revenue" || c === "CAPEX" ? c : "Cost");
  return (Object.keys(TOTAL_KIND_LABEL) as TotalKind[]).flatMap((kind) => {
    const own = lines.filter((l) => kindOf(l.category) === kind);
    if (!own.length) return [];
    const months = own.reduce((acc, l) => add(acc, l.months), zeros());
    return [{ kind, months, total: sum(months) }];
  });
}

/** The line list's search box: COA code, COA name or what the line is for. */
export function searchLines<L extends { coaCode: string; coaName: string; item?: string | null }>(lines: readonly L[], query: string | undefined): L[] {
  const q = query?.trim().toLowerCase() ?? "";
  return q ? lines.filter((l) => [l.coaCode, l.coaName, l.item ?? ""].some((v) => v.toLowerCase().includes(q))) : [...lines];
}
