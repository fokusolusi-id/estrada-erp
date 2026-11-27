/** Spending monitor per cost center and COA (plan E1; sheets 34_Budget_Plan to 36_Budget_Monitoring and 38). */
import type { Category } from "./budget";
import { money, sum, ZERO, type Money } from "./money";
import type { PaymentState } from "./payment";

export type SpendingStatus = "safe" | "warning" | "over";
export const SPENDING_STATUS_LABEL: Record<SpendingStatus, string> = { safe: "Aman", warning: "Waspada", over: "Melebihi" };

/** Aman below 80% of the annual budget, Waspada from 80% to 95%, Melebihi above 95%. */
export const spendingStatus = (utilisation: Money | null): SpendingStatus => (!utilisation || utilisation.lt(80) ? "safe" : utilisation.lte(95) ? "warning" : "over");

/** Plan E1: a request counts as committed from submission until it is paid; drafts and returned ones do not. */
const COMMITTED: readonly PaymentState[] = ["submitted", "under_review", "pending_approval", "approved", "scheduled"];

const DAY = 86_400_000;

/** Share of the budget year gone by on `today` (YYYY-MM-DD), 0 to 1. */
export function yearProgress(year: number, today: string): Money {
  const start = Date.UTC(year, 0, 1);
  const days = (Date.UTC(year + 1, 0, 1) - start) / DAY;
  const gone = Math.min(days, Math.max(0, (Date.parse(`${today}T00:00:00Z`) - start) / DAY + 1));
  return money(String(gone)).div(days);
}

export const REPORT_PERIODS = ["mtd", "qtd", "ytd"] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
export const REPORT_PERIOD_LABEL: Record<ReportPeriod, string> = { mtd: "Bulan berjalan (MTD)", qtd: "Kuartal berjalan (QTD)", ytd: "Tahun berjalan (YTD)" };

/** The dates a period covers up to `asOf`, inside the budget year; null before the year starts. */
export function periodWindow(year: number, asOf: string, period: ReportPeriod): { from: string; to: string } | null {
  if (asOf < `${year}-01-01`) return null;
  const to = asOf > `${year}-12-31` ? `${year}-12-31` : asOf;
  const month = Number(to.slice(5, 7));
  const first = period === "mtd" ? month : period === "qtd" ? month - ((month - 1) % 3) : 1;
  return { from: `${year}-${String(first).padStart(2, "0")}-01`, to };
}

/** The plan for a window: whole months, and the running month by the days gone (27_Budget_vs_Actual). */
function planned(months: readonly Money[], window: { from: string; to: string } | null): Money {
  if (!window) return ZERO;
  const [first, last] = [Number(window.from.slice(5, 7)), Number(window.to.slice(5, 7))];
  const days = new Date(Date.UTC(Number(window.to.slice(0, 4)), last, 0)).getUTCDate();
  return sum(months.slice(first - 1, last - 1)).plus((months[last - 1] ?? ZERO).times(Number(window.to.slice(8, 10))).div(days));
}

export interface Spending {
  /** The whole year. */
  budget: Money;
  /** The plan for the chosen period up to the as-of date. */
  prorata: Money;
  /** The automatic feed: payments paid in the period. */
  actual: Money;
  /** Accounting's accruals and corrections in the period, kept apart from the feed. */
  adjustment: Money;
  committed: Money;
  /** Year to date (paid and adjusted) plus commitments. */
  used: Money;
  remaining: Money;
  /** Percent of the annual budget used; null without a budget. */
  utilisation: Money | null;
  /** Paid and adjusted in the period against its plan: positive is ahead of plan. */
  variance: Money;
  /** Year-end spending at the pace so far; null before the year starts. */
  forecast: Money | null;
  status: SpendingStatus;
}

export type AccountSpending = Spending & { coaCode: string; coaName: string };
export type UnitMonitor = Spending & { unit: string; accounts: AccountSpending[] };

export interface Adjustment {
  unit: string;
  coaCode: string;
  date: string;
  /** Negative lowers the actual. */
  amount: Money;
}

const groupBy = <T>(items: readonly T[], key: (item: T) => string) => {
  const out = new Map<string, T[]>();
  for (const item of items) out.set(key(item), [...(out.get(key(item)) ?? []), item]);
  return out;
};

/** One budgeted line, or an adjustment's account that has no line. */
interface Entry {
  unit: string;
  coaCode: string;
  coaName: string;
  months: readonly Money[];
  actual: Money;
  actualYtd: Money;
  adjustment: Money;
  adjustmentYtd: Money;
  committed: Money;
}

export function budgetMonitor(
  lines: readonly { id: string; unit: string; coaCode: string; coaName: string; category: Category; months: readonly Money[] }[],
  payments: readonly { lineId: string | null; state: PaymentState; gross: Money; paidOn: string | null }[],
  adjustments: readonly Adjustment[],
  at: { year: number; asOf: string; period: ReportPeriod },
): { units: UnitMonitor[]; total: Spending } {
  const window = periodWindow(at.year, at.asOf, at.period);
  const ytd = periodWindow(at.year, at.asOf, "ytd");
  const progress = yearProgress(at.year, at.asOf);
  const within = (date: string, w: { from: string; to: string } | null) => !!w && date >= w.from && date <= w.to;

  const entries: Entry[] = lines
    .filter((l) => l.category !== "Revenue")
    .map((l) => {
      const mine = payments.filter((p) => p.lineId === l.id);
      const paid = (w: typeof window) => sum(mine.filter((p) => p.state === "paid" && !!p.paidOn && within(p.paidOn, w)).map((p) => p.gross));
      return { unit: l.unit, coaCode: l.coaCode, coaName: l.coaName, months: l.months, actual: paid(window), actualYtd: paid(ytd), adjustment: ZERO, adjustmentYtd: ZERO, committed: sum(mine.filter((p) => COMMITTED.includes(p.state)).map((p) => p.gross)) };
    });
  // An adjustment belongs to a unit and account, so it sits on the first of their lines, or on its own where there is none.
  for (const a of adjustments) {
    if (!within(a.date, ytd)) continue;
    let entry = entries.find((e) => e.unit === a.unit && e.coaCode === a.coaCode);
    if (!entry) entries.push((entry = { unit: a.unit, coaCode: a.coaCode, coaName: "Tanpa baris anggaran", months: [], actual: ZERO, actualYtd: ZERO, adjustment: ZERO, adjustmentYtd: ZERO, committed: ZERO }));
    entry.adjustmentYtd = entry.adjustmentYtd.plus(a.amount);
    if (within(a.date, window)) entry.adjustment = entry.adjustment.plus(a.amount);
  }

  const total = (group: readonly Entry[]): Spending => {
    const add = (pick: (e: Entry) => Money) => sum(group.map(pick));
    const budget = add((e) => sum([...e.months]));
    const prorata = add((e) => planned(e.months, window)).toDecimalPlaces(2);
    const [actual, adjustment, committed] = [add((e) => e.actual), add((e) => e.adjustment), add((e) => e.committed)];
    const toDate = add((e) => e.actualYtd.plus(e.adjustmentYtd));
    const used = toDate.plus(committed);
    const utilisation = budget.gt(0) ? used.div(budget).times(100) : null;
    return {
      budget,
      prorata,
      actual,
      adjustment,
      committed,
      used,
      remaining: budget.minus(used),
      utilisation,
      variance: actual.plus(adjustment).minus(prorata),
      forecast: progress.gt(0) ? toDate.div(progress).toDecimalPlaces(2) : null,
      // Spending without any budget is over it.
      status: !utilisation && used.gt(0) ? "over" : spendingStatus(utilisation),
    };
  };
  const units = [...groupBy(entries, (e) => e.unit)]
    .map(([unit, mine]) => ({
      unit,
      ...total(mine),
      accounts: [...groupBy(mine, (e) => e.coaCode)]
        .map(([coaCode, same]) => ({ coaCode, coaName: same[0]!.coaName, ...total(same) }))
        .sort((a, b) => a.coaCode.localeCompare(b.coaCode)),
    }))
    .sort((a, b) => a.unit.localeCompare(b.unit));
  return { units, total: total(entries) };
}

export type AdjustmentProblem = "amount" | "date" | "year" | "reason";
export const ADJUSTMENT_KINDS = ["accrual", "correction"] as const;
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number];
export const ADJUSTMENT_KIND_LABEL: Record<AdjustmentKind, string> = { accrual: "Akrual", correction: "Koreksi" };

/** `amount` is a plain decimal string; negative lowers the actual. */
export function adjustmentProblem({ date, amount, reason, today, year }: { date: string; amount: string; reason: string; today: string; year?: number }): AdjustmentProblem | null {
  if (!/^-?\d+(\.\d{1,2})?$/.test(amount) || money(amount).isZero()) return "amount";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return "date";
  if (year !== undefined && !date.startsWith(`${year}-`)) return "year";
  return reason.trim().length < 10 ? "reason" : null;
}

/** A row as plain strings: Decimal values cannot cross from a server page to a client component. */
export type PlainSpending = { [K in keyof Spending]: Spending[K] extends Money ? string : Spending[K] extends Money | null ? string | null : Spending[K] };
export type PlainUnitMonitor = PlainSpending & { unit: string; accounts: (PlainSpending & { coaCode: string; coaName: string })[] };

const plain = (s: Spending): PlainSpending => ({
  budget: s.budget.toFixed(),
  prorata: s.prorata.toFixed(),
  actual: s.actual.toFixed(),
  adjustment: s.adjustment.toFixed(),
  committed: s.committed.toFixed(),
  used: s.used.toFixed(),
  remaining: s.remaining.toFixed(),
  utilisation: s.utilisation?.toFixed() ?? null,
  variance: s.variance.toFixed(),
  forecast: s.forecast?.toFixed() ?? null,
  status: s.status,
});

export const plainMonitor = (units: readonly UnitMonitor[]): PlainUnitMonitor[] =>
  units.map((u) => ({ ...plain(u), unit: u.unit, accounts: u.accounts.map((a) => ({ ...plain(a), coaCode: a.coaCode, coaName: a.coaName })) }));
