import "server-only";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import {
  ZERO, concentration, drawingOwed, healthBand, healthValues, money, nettAmount, statement, stressCashIn, sum, weeklyCashflow, HEALTH_KPIS, type HealthInput, type Money,
} from "@estrada/domain";
import { CONSOLIDATED, loadCash } from "./cash";
import { loadCashYear } from "./cash-week";
import { loadActualPnl, loadBudgetPnl } from "./pnl";
import type { CurrentUser } from "./session";

const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** The inputs of the ten KPIs and the stress tests for a month, over the chosen companies. */
export async function loadHealth(user: CurrentUser, entities: string[], year: number, month: number, today: string, consolidated: boolean) {
  const months = Array.from({ length: month }, (_, i) => i + 1);
  const [sheets, pnl, budget, cashYear, forecastView, receivableInvoices, drawings, repaid, bills] = await Promise.all([
    db.select().from(schema.balanceSheet).where(and(eq(schema.balanceSheet.year, year), lte(schema.balanceSheet.month, month))),
    loadActualPnl(entities, year, months),
    loadBudgetPnl(entities, year, months),
    loadCashYear(year),
    loadCash(user, year),
    db
      .select({ entity: schema.invoice.entityCode, customer: schema.customer.nickname, dpp: schema.invoice.dpp, on: schema.invoice.invoicedOn })
      .from(schema.invoice)
      .innerJoin(schema.customer, eq(schema.customer.id, schema.invoice.customerId))
      .where(eq(schema.invoice.state, "issued")),
    db.select().from(schema.facilityDrawing).where(and(eq(schema.facilityDrawing.kind, "loan"), eq(schema.facilityDrawing.state, "issued"))),
    db.select().from(schema.facilityPayment).where(isNull(schema.facilityPayment.reversedAt)),
    db
      .select()
      .from(schema.paymentRequest)
      .where(inArray(schema.paymentRequest.state, ["submitted", "under_review", "pending_approval", "frm_approval", "director_approval", "approved", "scheduled"])),
  ]);

  // Each company's latest typed balance sheet up to the month; consolidated only when every company has one.
  const latest = entities.map((e) => sheets.filter((s) => s.entityCode === e).sort((a, b) => b.month - a.month)[0]);
  const have = latest.flatMap((s) => (s ? [s] : []));
  const total = (pick: (s: (typeof have)[number]) => string) => sum(have.map((s) => money(pick(s))));
  const balance =
    have.length === entities.length && have.length
      ? { currentAssets: total((s) => s.currentAssets), currentLiabilities: total((s) => s.currentLiabilities), totalAssets: total((s) => s.totalAssets), totalLiabilities: total((s) => s.totalLiabilities) }
      : null;
  const missingSheets = entities.filter((_, i) => !latest[i]);

  const lines = pnl.companies.flatMap((c) => c.lines);
  const s = statement(lines);
  const costOf = (list: typeof lines) => sum(list.filter((l) => l.category !== "Revenue").map((l) => l.amount));

  // The plan: Arus Kas, for the group or the one company.
  const scope = consolidated ? CONSOLIDATED : entities[0]!;
  const forecast = forecastView?.forecasts.get(scope);
  const loans = (forecastView?.facilities ?? []).filter((f) => consolidated || f.entity === entities[0]);
  let cash: HealthInput["cash"] = null;
  const flows = months.map((m) => weeklyCashflow(cashYear.openings, cashYear.events, { year, month: m, entities }).total);
  // Without an opening balance or any recorded movement there is no cash figure to judge.
  if (forecast && flows.some((f) => !f.available.isZero() || !f.ending.isZero())) {
    const out = flows.map((f) => f.available.minus(f.ending));
    const recent = out.slice(-3);
    const upTo = (list: readonly Money[]) => sum(list.slice(0, month));
    const planOut = sum([forecast.rows.cogsPaid, forecast.rows.opexPaid, forecast.rows.interestPaid, forecast.rows.taxPaid, forecast.rows.capexPaid].map(upTo))
      .negated()
      .plus(sum(loans.map((l) => upTo(l.repayment))));
    const openings = entities.flatMap((e) => (forecastView!.openings.get(e) ? [forecastView!.openings.get(e)!.minimumCash] : []));
    cash = {
      ending: flows.at(-1)!.ending,
      burn: recent.length ? sum(recent).div(recent.length) : ZERO,
      inActual: sum(flows.map((f) => f.inDirect.plus(f.inIndirect))),
      inPlan: upTo(forecast.rows.receipts),
      outActual: sum(out),
      outPlan: planOut,
      safety: consolidated ? (forecastView!.settings?.minimumCash ?? ZERO) : sum(openings),
    };
  }
  const input: HealthInput = { month, balance, pnl: { revenue: s.revenue, ebitda: s.ebitda, ebit: s.ebit, cost: costOf(lines) }, budgetCost: costOf(budget.lines), cash };
  const values = healthValues(input);
  const context = { safety: cash?.safety ?? ZERO, ebitdaMargin: values.ebitda_margin };
  const kpis = HEALTH_KPIS.map((key) => ({ key, value: values[key], band: values[key] ? healthBand(key, values[key]!, context) : null }));

  const soon = addDays(today, 90);
  const paid = repaid.map((p) => ({ drawingId: p.drawingId, principal: money(p.principal) }));
  const dueDebt = sum(
    drawings.filter((d) => entities.includes(d.entityCode) && d.dueOn && d.dueOn <= soon).map((d) => drawingOwed({ id: d.id, kind: d.kind, state: d.state, amount: money(d.amount) }, paid)),
  );
  const dueBills = sum(
    bills.filter((b) => entities.includes(b.entityCode) && b.dueOn && b.dueOn <= soon).map((b) => nettAmount({ gross: money(b.gross), ppn: money(b.ppn), pph: money(b.pph) })),
  );
  const mine = receivableInvoices.filter((i) => entities.includes(i.entity) && i.on.startsWith(`${year}-`) && Number(i.on.slice(5, 7)) <= month);
  const byCustomer = [...Map.groupBy(mine, (i) => i.customer)].map(([customer, rows]) => ({ customer, total: sum(rows.map((r) => money(r.dpp))) })).sort((a, b) => b.total.cmp(a.total));
  const top = byCustomer[0];

  return {
    kpis,
    missingSheets,
    hasForecast: !!forecast,
    stress: {
      cashIn: forecast ? stressCashIn({ closing: forecast.rows.closing, receipts: forecast.rows.receipts }) : null,
      liabilities: balance ? concentration(dueDebt.plus(dueBills), balance.totalLiabilities, 40) : null,
      customer: top ? { name: top.customer, ...concentration(top.total, sum(byCustomer.map((c) => c.total)), 50)! } : null,
    },
  };
}
