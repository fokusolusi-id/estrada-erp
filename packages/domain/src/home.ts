/** The Beranda cards that need no new module (plan D0): sheets EXEC_04, 10, 11, 13, 14, 15. */
import type { Category } from "./budget";
import { money, sum, ZERO, type Money } from "./money";
import type { OrgTree } from "./org";
import type { Actor } from "./policy";
import { DEAL_STATUSES, canPipeline, type DealStatus } from "./pipeline";

export type HomeWidget = "rka" | "costCenter" | "cashflow" | "obligo" | "pipeline" | "headcount" | "projects";
const ORDER: readonly HomeWidget[] = ["rka", "costCenter", "cashflow", "obligo", "pipeline", "headcount", "projects"];

/** The Head of FRM sits as CFO (client decision). */
export const isCfo = (actor: Actor, org: OrgTree) => actor.role === "division_owner" && org.isWithin(actor.orgUnit, "FRM");

export function homeWidgets(actor: Actor, org: OrgTree): HomeWidget[] {
  const { role } = actor;
  if (role === "admin" || role === "bfp") return [];
  const inUnit = (unit: string) => org.isWithin(actor.orgUnit, unit);
  const unitStaff = role === "requestor" || role === "default_owner" || role === "division_owner";
  const overseer = role === "director" || role === "auditor";
  const cfo = isCfo(actor, org);
  const may: Record<HomeWidget, boolean> = {
    rka: overseer || role === "finance" || role === "division_owner",
    costCenter: role === "finance" || role === "default_owner" || role === "division_owner",
    cashflow: overseer || role === "finance" || role === "cash_manager" || cfo,
    obligo: overseer || role === "finance" || role === "cash_manager" || cfo,
    pipeline: overseer || (unitStaff && canPipeline(actor, "view", null, org)),
    headcount: overseer || role === "division_owner" || (unitStaff && inUnit("HCM")),
    projects: overseer || (unitStaff && (inUnit("BCD") || inUnit("PDMS"))),
  };
  return ORDER.filter((w) => may[w]);
}

/** Months of the budget year that have begun by `today` (YYYY-MM-DD). */
export function monthsElapsed(year: number, today: string): number {
  const now = Number(today.slice(0, 4));
  return year > now ? 0 : year < now ? 12 : Number(today.slice(5, 7));
}

export interface UnitSpending {
  unit: string;
  budget: Money;
  actual: Money;
  committed: Money;
  remaining: Money;
  /** Percent of the budget used or committed; null without a budget. */
  utilisation: Money | null;
  /** The year's spending at the pace so far; null before the year starts. */
  runRate: Money | null;
  /** Run rate more than 10% away from the budget, where there is spending to judge by. */
  flagged: boolean;
}

/** Cost lines (everything but Revenue) per unit against what payments have used. */
export function spendingByUnit(
  lines: readonly { id: string; unit: string; category: Category; months: readonly Money[] }[],
  realisasi: ReadonlyMap<string, { months: readonly Money[]; committed: Money }>,
  months: number,
): UnitSpending[] {
  const units = new Map<string, { budget: Money; actual: Money; committed: Money }>();
  for (const l of lines) {
    if (l.category === "Revenue") continue;
    const row = units.get(l.unit) ?? { budget: ZERO, actual: ZERO, committed: ZERO };
    const used = realisasi.get(l.id);
    units.set(l.unit, {
      budget: row.budget.plus(sum([...l.months])),
      actual: row.actual.plus(sum([...(used?.months ?? [])])),
      committed: row.committed.plus(used?.committed ?? ZERO),
    });
  }
  return [...units]
    .map(([unit, r]) => {
      const runRate = months ? r.actual.div(months).times(12) : null;
      return {
        unit,
        ...r,
        remaining: r.budget.minus(r.actual).minus(r.committed),
        utilisation: r.budget.gt(0) ? r.actual.plus(r.committed).div(r.budget).times(100) : null,
        runRate,
        flagged: !!runRate && r.actual.gt(0) && r.budget.gt(0) && runRate.minus(r.budget).abs().div(r.budget).gt("0.1"),
      };
    })
    .sort((a, b) => a.unit.localeCompare(b.unit));
}

const DAY = 86_400_000;

export function pipelineFunnel(deals: readonly { status: DealStatus; value: string; probability: string; createdOn: string }[], today: string) {
  return DEAL_STATUSES.flatMap((status) => {
    const here = deals.filter((d) => d.status === status);
    if (!here.length) return [];
    const ages = here.map((d) => Math.max(0, Math.round((Date.parse(today) - Date.parse(d.createdOn)) / DAY)));
    return [
      {
        status,
        deals: here.length,
        value: sum(here.map((d) => money(d.value))),
        weighted: sum(here.map((d) => money(d.value).times(money(d.probability)).div(100))),
        /** Average days since the deal was entered. */
        ageDays: Math.round(ages.reduce((a, b) => a + b, 0) / ages.length),
      },
    ];
  });
}

type Months = readonly Money[];

export function cashSummary(rows: { receipts: Months; cogsPaid: Months; opexPaid: Months; interestPaid: Months; taxPaid: Months; capexPaid: Months; closing: Months }) {
  // Payments are stored as negative flows.
  const out = rows.receipts.map((_, i) => sum([rows.cogsPaid, rows.opexPaid, rows.interestPaid, rows.taxPaid, rows.capexPaid].map((m) => m[i] ?? ZERO)).abs());
  const ending = rows.closing.at(-1) ?? ZERO;
  const average = sum(out).div(12);
  return {
    in: [...rows.receipts],
    out,
    closing: [...rows.closing],
    ending,
    /** Months the year-end balance covers at the year's average spending. */
    // A balance already below zero covers nothing.
    runwayMonths: average.gt(0) ? (ending.gt(0) ? ending.div(average).toDecimalPlaces(1) : ZERO) : null,
  };
}

/** `month` 0 means before the year: the opening balances. */
export function obligoSummary(facilities: readonly { name: string; creditLimit: Money | null; openingBalance: Money; outstanding: Months }[], month: number) {
  const rows = facilities.map((f) => {
    const outstanding = month > 0 ? (f.outstanding[month - 1] ?? f.openingBalance) : f.openingBalance;
    return {
      name: f.name,
      limit: f.creditLimit,
      outstanding,
      available: f.creditLimit ? f.creditLimit.minus(outstanding) : null,
      utilisation: f.creditLimit?.gt(0) ? outstanding.div(f.creditLimit).times(100) : null,
    };
  });
  const limit = sum(rows.map((r) => r.limit ?? ZERO));
  return {
    rows,
    limit,
    outstanding: sum(rows.map((r) => r.outstanding)),
    /** A facility holding more than half the plafon; per bank once banks are recorded (B5). */
    concentrated: rows.find((r) => r.limit && limit.gt(0) && r.limit.div(limit).gt("0.5"))?.name ?? null,
  };
}

export function headcountByUnit(people: readonly string[], plan: readonly { unit: string; count: number }[]) {
  const rows = new Map<string, { actual: number; planned: number }>();
  const of = (unit: string) => rows.get(unit) ?? rows.set(unit, { actual: 0, planned: 0 }).get(unit)!;
  for (const unit of people) of(unit).actual += 1;
  for (const p of plan) of(p.unit).planned += p.count;
  return [...rows].map(([unit, r]) => ({ unit, ...r })).sort((a, b) => a.unit.localeCompare(b.unit));
}
