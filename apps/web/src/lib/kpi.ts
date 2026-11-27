import "server-only";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { DEFAULT_SEASONALITY, isWon, money, statement, sum, ZERO, type KpiTargets, type Money } from "@estrada/domain";
import { loadActualPnl } from "./pnl";

export type KpiRow = typeof schema.kpiTarget.$inferSelect;

export const targetsOf = (r: KpiRow): KpiTargets => ({
  revenue: money(r.revenue),
  revenueDirect: money(r.revenueDirect),
  ebitdaPct: money(r.ebitdaPct),
  cashIn: money(r.cashIn),
  netMarginPct: money(r.netMarginPct),
});

/** Each company's versions for a year, newest first: `latest` is being worked on, `active` is the approved one. */
export async function loadTargets(year: number) {
  const [rows, [scenario]] = await Promise.all([
    db.select().from(schema.kpiTarget).where(eq(schema.kpiTarget.fiscalYear, year)).orderBy(desc(schema.kpiTarget.version)),
    db.select({ seasonality: schema.scenarioSetting.seasonality }).from(schema.scenarioSetting).where(eq(schema.scenarioSetting.fiscalYear, year)),
  ]);
  const of = (entity: string) => ({ latest: rows.find((r) => r.entityCode === entity) ?? null, active: rows.find((r) => r.entityCode === entity && r.state === "approved") ?? null });
  return { of, seasonality: scenario?.seasonality ?? [...DEFAULT_SEASONALITY] };
}

export interface KpiActual {
  /** Value of the deals won (Won Bidding or Closed Won), and its direct part (not billed via Telkom). */
  revenueWon: Money;
  cashIn: Money;
  /** Revenue, EBITDA and net profit of the months so far. */
  revenue: Money;
  ebitda: Money;
  net: Money;
}

/** What the modules recorded for each company up to a month; nothing here is typed (BR-KPI-002). */
export async function loadActuals(entities: string[], year: number, month: number): Promise<Map<string, KpiActual>> {
  if (!entities.length) return new Map();
  const [deals, receipts, pnl] = await Promise.all([
    db
      .select({ entity: schema.pipelineDeal.entityCode, status: schema.pipelineDeal.status, value: schema.pipelineDeal.value })
      .from(schema.pipelineDeal)
      .where(and(eq(schema.pipelineDeal.fiscalYear, year), inArray(schema.pipelineDeal.entityCode, entities))),
    db
      .select({ entity: schema.invoice.entityCode, on: schema.cashReceipt.receivedOn, amount: schema.cashReceipt.amount })
      .from(schema.cashReceipt)
      .innerJoin(schema.invoice, eq(schema.invoice.id, schema.cashReceipt.invoiceId))
      .where(isNull(schema.cashReceipt.reversedAt)),
    loadActualPnl(entities, year, Array.from({ length: month }, (_, i) => i + 1)),
  ]);
  const last = `${year}-${String(month).padStart(2, "0")}-31`;
  return new Map(
    entities.map((entity) => {
      const s = statement(pnl.companies.find((c) => c.entity === entity)?.lines ?? []);
      return [
        entity,
        {
          revenueWon: sum(deals.filter((d) => d.entity === entity && isWon(d.status)).map((d) => money(d.value))),
          cashIn: sum(receipts.filter((r) => r.entity === entity && r.on >= `${year}-01-01` && r.on <= last).map((r) => money(r.amount))),
          revenue: s.revenue ?? ZERO,
          ebitda: s.ebitda,
          net: s.net,
        },
      ];
    }),
  );
}
