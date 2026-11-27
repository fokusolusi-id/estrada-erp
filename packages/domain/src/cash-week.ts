/** Weekly cashflow (plan B4; sheet FC07_Finance addendum 1; BR-CF-001..003). */
import { sum, ZERO, type Money } from "./money";

export const WEEKS = [1, 2, 3, 4] as const;

/** 1-7, 8-14, 15-21, and the rest of the month (client decision). */
export const weekOf = (date: string): number => Math.min(4, Math.floor((Number(date.slice(8, 10)) - 1) / 7) + 1);

export type CostClass = "direct" | "opex" | "other";

/** Project cost is 5100-5900, operating cost 6100-6420. */
export const costClass = (coaCode: string | null): CostClass => (coaCode && /^5[1-9]/.test(coaCode) ? "direct" : coaCode && /^6[1-4]/.test(coaCode) ? "opex" : "other");

/** Money that reaches us through a Telkom company for someone else's project (client decision). */
export function isIndirectReceipt(customer: string, endCustomer: string | null): boolean {
  const end = endCustomer?.trim().toLowerCase();
  return /\btelkom/i.test(customer) && !!end && !customer.toLowerCase().includes(end);
}

/** What Cash Management types beside the automatic receipts and payments. */
export const CASH_ENTRY_KINDS = ["loan_in", "other_in", "interest", "repayment", "cost", "other_out"] as const;
export type CashEntryKind = (typeof CASH_ENTRY_KINDS)[number];
export const CASH_ENTRY_LABEL: Record<CashEntryKind, string> = {
  loan_in: "Pinjaman / injeksi kas",
  other_in: "Penerimaan lain",
  interest: "Bunga pinjaman",
  repayment: "Cicilan KMK / pinjaman",
  cost: "Biaya di luar Permintaan Pembayaran",
  other_out: "Pengeluaran lain",
};

export interface CashEvent {
  entity: string;
  date: string;
  kind: "in_direct" | "in_indirect" | "payment" | CashEntryKind;
  amount: Money;
  /** The account of a payment or a typed cost. */
  coaCode: string | null;
}

const IN = ["in_direct", "in_indirect", "loan_in", "other_in"];
const isCost = (e: CashEvent) => e.kind === "payment" || e.kind === "cost";

export interface CashColumn {
  /** Cash on hand at the start. */
  opening: Money;
  inDirect: Money;
  inIndirect: Money;
  loanIn: Money;
  otherIn: Money;
  /** A = opening + everything in. */
  available: Money;
  direct: Money;
  opex: Money;
  otherOut: Money;
  interest: Money;
  repayment: Money;
  ending: Money;
}

function column(opening: Money, events: readonly CashEvent[]): CashColumn {
  const total = (pick: (e: CashEvent) => boolean) => sum(events.filter(pick).map((e) => e.amount));
  const of = (kind: CashEvent["kind"]) => total((e) => e.kind === kind);
  const [inDirect, inIndirect, loanIn, otherIn] = [of("in_direct"), of("in_indirect"), of("loan_in"), of("other_in")];
  const direct = total((e) => isCost(e) && costClass(e.coaCode) === "direct");
  const opex = total((e) => isCost(e) && costClass(e.coaCode) === "opex");
  const otherOut = total((e) => e.kind === "other_out" || (isCost(e) && costClass(e.coaCode) === "other"));
  const [interest, repayment] = [of("interest"), of("repayment")];
  const available = sum([opening, inDirect, inIndirect, loanIn, otherIn]);
  return { opening, inDirect, inIndirect, loanIn, otherIn, available, direct, opex, otherOut, interest, repayment, ending: available.minus(sum([direct, opex, otherOut, interest, repayment])) };
}

const net = (events: readonly CashEvent[]) => sum(events.map((e) => (IN.includes(e.kind) ? e.amount : e.amount.negated())));

/** A month's four weeks for the chosen companies, from each one's 1 January cash. */
export function weeklyCashflow(openings: ReadonlyMap<string, Money>, events: readonly CashEvent[], at: { year: number; month: number; entities: readonly string[] }) {
  const prefix = `${at.year}-${String(at.month).padStart(2, "0")}`;
  const mine = events.filter((e) => at.entities.includes(e.entity) && e.date.startsWith(`${at.year}-`));
  let cash = sum(at.entities.map((e) => openings.get(e) ?? ZERO)).plus(net(mine.filter((e) => e.date.slice(0, 7) < prefix)));
  const month = mine.filter((e) => e.date.startsWith(prefix));
  const total = column(cash, month);
  const weeks = WEEKS.map((w) => {
    const made = column(cash, month.filter((e) => weekOf(e.date) === w));
    cash = made.ending;
    return made;
  });
  const codes = [...new Set(month.filter(isCost).map((e) => e.coaCode ?? ""))].sort();
  const accounts = codes.map((coaCode) => {
    const here = month.filter((e) => isCost(e) && (e.coaCode ?? "") === coaCode);
    return { coaCode, class: costClass(coaCode || null), weeks: WEEKS.map((w) => sum(here.filter((e) => weekOf(e.date) === w).map((e) => e.amount))), total: sum(here.map((e) => e.amount)) };
  });
  return { weeks, total, accounts };
}

export type CashEntryProblem = "amount" | "date" | "description" | "account";

export function cashEntryProblem(v: { amount: Money; date: string; today: string; description: string; kind: CashEntryKind; coaCode: string | null }): CashEntryProblem | null {
  if (!v.amount.gt(0)) return "amount";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || v.date > v.today) return "date";
  if (v.description.trim().length < 5) return "description";
  return v.kind === "cost" && !v.coaCode ? "account" : null;
}
