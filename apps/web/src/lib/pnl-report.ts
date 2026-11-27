import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { REPORT_PERIODS, comparePnl, consolidatePnl, periodWindow, type Actor, type ReportPeriod } from "@estrada/domain";
import { todayJakarta } from "./payment";
import { loadActualPnl, loadBudgetPnl } from "./pnl";

/** The report the screen and the Excel file share: the asked month and period, for the companies the person sees. */
export async function loadPnlReport(actor: Actor, asked: { bulan?: string | undefined; periode?: string | undefined; mentah?: string | undefined }, chosen: string | null) {
  const today = todayJakarta();
  const bulan = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked.bulan ?? "") ? asked.bulan! : today.slice(0, 7);
  const period: ReportPeriod = REPORT_PERIODS.find((p) => p === asked.periode) ?? "ytd";
  const year = Number(bulan.slice(0, 4));
  const last = new Date(Date.UTC(year, Number(bulan.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const range = periodWindow(year, last, period)!;
  const [first, until] = [Number(range.from.slice(5, 7)), Number(range.to.slice(5, 7))];
  const months = Array.from({ length: until - first + 1 }, (_, i) => first + i);
  const companies = (await db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true))).map((c) => c.code).sort();
  const mine = companies.filter((c) => actor.entities.includes("*") || actor.entities.includes(c));
  const entities = chosen && mine.includes(chosen) ? [chosen] : mine;
  const eliminate = asked.mentah !== "1";
  const [actual, budget] = await Promise.all([loadActualPnl(entities, year, months), loadBudgetPnl(entities, year, months)]);
  const consolidated = consolidatePnl(actual.companies, eliminate);
  return {
    bulan, period, year, months, entities, eliminate,
    budgetFound: budget.found,
    closedMonths: actual.closedMonths,
    rows: comparePnl(consolidated.lines, budget.lines),
    eliminated: consolidated.eliminated,
    pairs: consolidated.pairs,
    // Each company on its own, before any elimination.
    perEntity: actual.companies.map((c) => ({ entity: c.entity, lines: c.lines })),
  };
}
