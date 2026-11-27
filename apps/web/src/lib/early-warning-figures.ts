import "server-only";
import { eq, isNull } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import {
  ZERO, agingByCustomer, chargeableVersion, consolidateTargets, isLost, isWon, money, monthsElapsed, outstandingOf, phasedTarget, spendingByUnit, statement, sum, weeklyCashflow,
  type EwFigures, type Money, type OrgTree,
} from "@estrada/domain";
import { loadCashYear } from "./cash-week";
import { loadTargets, targetsOf } from "./kpi";
import { loadObligo } from "./obligo";
import { paymentRealisasi } from "./payment";
import { loadActualPnl } from "./pnl";
import { loadReceivables } from "./receivable";

const day = (offset: number, from: string) => new Date(Date.parse(`${from}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

/** What the fifteen rules judge, for the whole group in the year of `today`. */
export async function loadEwFigures(today: string, org: OrgTree): Promise<EwFigures> {
  const year = Number(today.slice(0, 4));
  const month = monthsElapsed(year, today);
  const entities = (await db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true))).map((c) => c.code);
  const months = Array.from({ length: month }, (_, i) => i + 1);
  const last3 = months.slice(-3);
  const quarter = months.filter((m) => Math.ceil(m / 3) === Math.ceil(month / 3));
  const [cashYear, obligo, receivables, invoices, receipts, targets, deals, pnl, rolling, quarterly, sheets, versions, employees] = await Promise.all([
    loadCashYear(year),
    loadObligo(today),
    loadReceivables(() => true),
    db.select().from(schema.invoice).where(eq(schema.invoice.state, "issued")),
    db.select().from(schema.cashReceipt).where(isNull(schema.cashReceipt.reversedAt)),
    loadTargets(year),
    db.select().from(schema.pipelineDeal).where(eq(schema.pipelineDeal.fiscalYear, year)),
    loadActualPnl(entities, year, months),
    loadActualPnl(entities, year, last3),
    loadActualPnl(entities, year, quarter),
    db.select().from(schema.balanceSheet).where(eq(schema.balanceSheet.year, year)),
    db.select().from(schema.budgetVersion),
    db.select({ nip: schema.employee.nip }).from(schema.employee).where(eq(schema.employee.active, true)),
  ]);
  const of = (r: typeof pnl) => statement(r.companies.flatMap((c) => c.lines));

  const flows = months.map((m) => weeklyCashflow(cashYear.openings, cashYear.events, { year, month: m, entities }).total);
  const recorded = flows.some((f) => !f.available.isZero() || !f.ending.isZero());
  const burn = flows.slice(-3).map((f) => f.available.minus(f.ending));
  const average = burn.length ? sum(burn).div(burn.length) : ZERO;
  const ending = flows.at(-1)?.ending ?? ZERO;

  const open = receivables.open;
  const aging = agingByCustomer(open, today);
  /** Receivables at a date over the sales of the 90 days before it, in days. */
  const dsoAt = (date: string): Money | null => {
    const billed = invoices.filter((i) => i.invoicedOn <= date);
    const sales = sum(billed.filter((i) => i.invoicedOn > day(-90, date)).map((i) => money(i.receivable)));
    const owed = sum(billed.map((i) => outstandingOf({ receivable: money(i.receivable) }, sum(receipts.filter((r) => r.invoiceId === i.id && r.receivedOn <= date).map((r) => money(r.amount))))));
    return sales.gt(0) ? owed.times(90).div(sales).toDecimalPlaces(1) : null;
  };
  const monthEnds = [3, 2, 1].map((back) => day(-1, new Date(Date.UTC(year, Number(today.slice(5, 7)) - back, 1)).toISOString().slice(0, 10)));

  const approved = entities.flatMap((e) => (targets.of(e).active ? [targets.of(e).active!] : []));
  const target = approved.length ? consolidateTargets(approved.map(targetsOf)) : null;
  const phased = (m: number) => (target && m > 0 ? phasedTarget(target.revenue, targets.seasonality, m) : ZERO);
  const won = sum(deals.filter((d) => isWon(d.status)).map((d) => money(d.value)));
  const live = sum(deals.filter((d) => !isWon(d.status) && !isLost(d.status)).map((d) => money(d.value)));

  const balances = entities.map((e) => sheets.filter((s) => s.entityCode === e && s.month <= month).sort((a, b) => b.month - a.month)[0]);
  const complete = balances.length > 0 && balances.every(Boolean);

  const version = chargeableVersion(versions, year);
  let divisions: EwFigures["divisions"] = [];
  let units: EwFigures["units"] = [];
  let planned = 0;
  if (version) {
    const rows = await db
      .select({ id: schema.budgetLine.id, unit: schema.budgetLine.ownerUnit, category: schema.coaAccount.category, month: schema.budgetLineAmount.month, amount: schema.budgetLineAmount.amount })
      .from(schema.budgetLineAmount)
      .innerJoin(schema.budgetLine, eq(schema.budgetLine.id, schema.budgetLineAmount.lineId))
      .innerJoin(schema.coaAccount, eq(schema.coaAccount.code, schema.budgetLine.coaCode))
      .where(eq(schema.budgetLine.versionId, version.id));
    // Budget and spending to date: the months so far.
    const lines = [...Map.groupBy(rows, (r) => r.id)].map(([id, list]) => ({ id, unit: list[0]!.unit, category: list[0]!.category, months: list.filter((r) => r.month <= month).map((r) => money(r.amount)) }));
    const used = await paymentRealisasi(lines.map((l) => l.id), year);
    const spend = (key: (unit: string) => string) => spendingByUnit(lines.map((l) => ({ ...l, unit: key(l.unit) })), used, month).map((u) => ({ unit: u.unit, actual: u.actual, budget: u.budget }));
    divisions = spend((u) => org.divisionOf(u));
    units = spend((u) => u);
    const heads = await db
      .select({ count: schema.headcountPlan.headCount })
      .from(schema.headcountPlan)
      .innerJoin(schema.budgetLine, eq(schema.budgetLine.id, schema.headcountPlan.lineId))
      .where(eq(schema.budgetLine.versionId, version.id));
    planned = heads.reduce((n, h) => n + h.count, 0);
  }
  const all = of(pnl);
  const recent = of(rolling);

  return {
    cash: recorded ? { ending, runwayMonths: average.gt(0) ? ending.div(average).toDecimalPlaces(1) : null } : null,
    obligo: { used: sum(obligo.drawings.map((d) => d.owed)), plafon: sum(obligo.facilities.filter((f) => f.active).map((f) => money(f.plafon))) },
    quarterRevenue: target && month ? { actual: of(quarterly).revenue, target: phased(month).minus(phased(quarter[0]! - 1)) } : null,
    receivable: {
      over90: sum(aging.map((a) => a.buckets.over90)),
      total: sum(aging.map((a) => a.total)),
      overdue30: sum(open.filter((i) => i.dueOn < day(-30, today)).map((i) => i.outstanding)),
    },
    dso: monthEnds.map(dsoAt),
    pipeline: target && target.revenue.gt(won) ? { open: live, remaining: target.revenue.minus(won) } : null,
    interest: { ebit: all.ebit, expense: all.interest.abs() },
    balance: complete ? { liabilities: sum(balances.map((s) => money(s!.totalLiabilities))), equity: sum(balances.map((s) => money(s!.equity))) } : null,
    rolling: { net: recent.net, revenue: recent.revenue },
    headcount: { actual: employees.length, plan: planned },
    divisions,
    units,
  };
}
