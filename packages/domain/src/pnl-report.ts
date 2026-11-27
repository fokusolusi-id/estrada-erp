/** The profit and loss statement (plan B8; sheet P1_Module_Spec P1-M6, P1-M9; BR-FIN-004, BR-FIN-007). */
import type { IntercompanyAmount, PnlLine } from "./closing";
import { sum, ZERO, type Money } from "./money";

export type PnlGroup = "revenue" | "cogs" | "opex" | "depreciation" | "other_income" | "interest" | "other_expense" | "tax";

/** Depreciation (58xx, 629x) sits below EBITDA; within "Lain-lain", 71xx is income and 722x-723x interest. */
export function pnlGroupOf(l: { coaCode: string; category: PnlLine["category"] }): PnlGroup {
  if (l.category === "Revenue") return "revenue";
  if (/^(58|629)/.test(l.coaCode)) return "depreciation";
  if (l.category === "COGS") return "cogs";
  if (l.category === "OPEX") return "opex";
  if (l.category === "TAX") return "tax";
  return /^71/.test(l.coaCode) ? "other_income" : /^72[23]/.test(l.coaCode) ? "interest" : "other_expense";
}

export const STATEMENT_ROWS = ["revenue", "cogs", "gross", "opex", "ebitda", "depreciation", "ebit", "other_income", "interest", "other_expense", "ebt", "tax", "net"] as const;
export type StatementKey = (typeof STATEMENT_ROWS)[number];
export const STATEMENT_LABEL: Record<StatementKey, string> = {
  revenue: "Pendapatan",
  cogs: "Beban Pokok Pendapatan",
  gross: "Laba Kotor",
  opex: "Beban Operasional",
  ebitda: "EBITDA",
  depreciation: "Penyusutan dan amortisasi",
  ebit: "EBIT",
  other_income: "Pendapatan lain-lain",
  interest: "Beban bunga",
  other_expense: "Beban lain-lain",
  ebt: "Laba sebelum pajak",
  tax: "Pajak",
  net: "Laba bersih",
};
/** Rows computed from the others. */
export const STATEMENT_RESULTS: readonly StatementKey[] = ["gross", "ebitda", "ebit", "ebt", "net"];

export function statement(lines: readonly PnlLine[]): Record<StatementKey, Money> {
  const of = (g: PnlGroup) => sum(lines.filter((l) => pnlGroupOf(l) === g).map((l) => l.amount));
  const [revenue, cogs, opex, depreciation] = [of("revenue"), of("cogs"), of("opex"), of("depreciation")];
  const [other_income, interest, other_expense, tax] = [of("other_income"), of("interest"), of("other_expense"), of("tax")];
  const gross = revenue.minus(cogs);
  const ebitda = gross.minus(opex);
  const ebit = ebitda.minus(depreciation);
  const ebt = ebit.plus(other_income).minus(interest).minus(other_expense);
  return { revenue, cogs, gross, opex, ebitda, depreciation, ebit, other_income, interest, other_expense, ebt, tax, net: ebt.minus(tax) };
}

export interface EntityPnl {
  entity: string;
  lines: readonly PnlLine[];
  intercompany: readonly IntercompanyAmount[];
}

/** Adds lines of the same account. */
function merge(lines: readonly PnlLine[]): PnlLine[] {
  const out = new Map<string, PnlLine>();
  for (const l of lines) {
    const key = `${pnlGroupOf(l)}:${l.coaCode}`;
    const found = out.get(key);
    out.set(key, found ? { ...found, amount: found.amount.plus(l.amount) } : { ...l });
  }
  return [...out.values()].sort((a, b) => (a.coaCode || "~").localeCompare(b.coaCode || "~"));
}

/** The companies added up; with `eliminate`, less what they sold to and bought from each other. */
export function consolidatePnl(companies: readonly EntityPnl[], eliminate: boolean) {
  const inside = new Set(companies.map((c) => c.entity));
  const between = companies.flatMap((c) => c.intercompany.filter((i) => inside.has(i.counterparty) && i.counterparty !== c.entity).map((i) => ({ ...i, entity: c.entity })));
  const removed = eliminate ? between : [];
  const lines = merge([...companies.flatMap((c) => c.lines), ...removed.map((i) => ({ coaCode: i.coaCode, name: i.name, category: i.category, amount: i.amount.negated() }))]).filter((l) => !l.amount.isZero());
  const pairs = new Map<string, { seller: string; buyer: string; revenue: Money; cost: Money }>();
  for (const i of between) {
    const sale = i.category === "Revenue";
    const [seller, buyer] = sale ? [i.entity, i.counterparty] : [i.counterparty, i.entity];
    const p = pairs.get(`${seller}>${buyer}`) ?? { seller, buyer, revenue: ZERO, cost: ZERO };
    pairs.set(`${seller}>${buyer}`, sale ? { ...p, revenue: p.revenue.plus(i.amount) } : { ...p, cost: p.cost.plus(i.amount) });
  }
  const total = (sale: boolean) => sum(removed.filter((i) => (i.category === "Revenue") === sale).map((i) => i.amount));
  return { lines, eliminated: { revenue: total(true), cost: total(false) }, pairs: [...pairs.values()] };
}

/** Actual beside the RKA for each statement row, with the accounts behind the group rows. */
export function comparePnl(actual: readonly PnlLine[], budget: readonly PnlLine[]) {
  const [a, b] = [statement(actual), statement(budget)];
  const [am, bm] = [merge(actual), merge(budget)];
  const compare = (x: Money, y: Money) => ({ actual: x, budget: y, variance: x.minus(y), achieved: y.isZero() ? null : x.times(100).div(y).toDecimalPlaces(1) });
  return STATEMENT_ROWS.map((key) => {
    const codes = new Map([...am, ...bm].filter((l) => pnlGroupOf(l) === key).map((l) => [l.coaCode, l.name]));
    const of = (lines: readonly PnlLine[], code: string) => sum(lines.filter((l) => pnlGroupOf(l) === key && l.coaCode === code).map((l) => l.amount));
    const accounts = [...codes].sort(([x], [y]) => (x || "~").localeCompare(y || "~")).map(([coaCode, name]) => ({ coaCode, name, ...compare(of(am, coaCode), of(bm, coaCode)) }));
    return { key, ...compare(a[key], b[key]), accounts };
  });
}
