import { poCommitments } from "./payment";
import "server-only";
import { asc, between, inArray } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { REPORT_PERIODS, budgetMonitor, can, isCfo, money, type OrgTree, type ReportPeriod } from "@estrada/domain";
import { approvedBudget, companyWide } from "./home";
import { todayJakarta } from "./payment";
import { loadScopedLines, reportVersions } from "./rka";
import type { CurrentUser } from "./session";
import { viewLines } from "./view-filter";

/** The as-of date and period from the address; today and year-to-date otherwise. */
export function readPeriod(sp: Record<string, string | string[] | undefined>): { asOf: string; period: ReportPeriod } {
  const date = typeof sp.per === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.per) && !Number.isNaN(Date.parse(sp.per)) ? sp.per : todayJakarta();
  return { asOf: date, period: REPORT_PERIODS.find((p) => p === sp.periode) ?? "ytd" };
}

/**
 * The approved budget against payments and Accounting's adjustments, for the seat and the header's view. The CFO and
 * Accounting read the whole company.
 */
export async function loadMonitor(user: CurrentUser, org: OrgTree, at: { asOf: string; period: ReportPeriod }) {
  const version = approvedBudget(await reportVersions());
  if (!version) return null;
  const everything = isCfo(user.actor, org) || can(user.actor, "actual.adjust", null, org);
  const lines = await viewLines(await loadScopedLines(everything ? companyWide(user) : user, undefined, version.id));
  const [payments, adjusted] = await Promise.all([
    lines.length
      ? db
          .select({ lineId: schema.paymentRequest.budgetLineId, state: schema.paymentRequest.state, gross: schema.paymentRequest.gross, paidOn: schema.paymentRequest.paidOn })
          .from(schema.paymentRequest)
          .where(inArray(schema.paymentRequest.budgetLineId, lines.map((l) => l.id)))
      : [],
    db
      .select()
      .from(schema.actualAdjustment)
      .where(between(schema.actualAdjustment.datedOn, `${version.fiscalYear}-01-01`, `${version.fiscalYear}-12-31`))
      .orderBy(asc(schema.actualAdjustment.datedOn), asc(schema.actualAdjustment.createdAt)),
  ]);
  // Only adjustments for a unit and entity the reader's lines cover.
  const scope = new Set(lines.map((l) => `${l.entity}|${l.ownerUnit}`));
  const adjustments = adjusted.filter((a) => everything || scope.has(`${a.entityCode}|${a.unitCode}`));
  const monitor = budgetMonitor(
    lines.map((l) => ({ id: l.id, unit: l.ownerUnit, coaCode: l.coaCode, coaName: l.coaName, category: l.category, months: l.months })),
    [...payments, ...(await poCommitments(lines.map((l) => l.id), ["submitted", "under_review", "pending_approval", "frm_approval", "director_approval", "approved", "scheduled", "paid"]))].map((p) => ({ ...p, gross: money(p.gross) })),
    adjustments.map((a) => ({ unit: a.unitCode, coaCode: a.coaCode, date: a.datedOn, amount: money(a.amount) })),
    { year: version.fiscalYear, ...at },
  );
  return { version, adjustments, ...monitor };
}
