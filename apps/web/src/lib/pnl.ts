import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { chargeableVersion, money, type EntityPnl, type IntercompanyAmount, type PnlLine } from "@estrada/domain";
import { loadMonthPnl } from "./closing";

type Stored = { coaCode: string; name: string; category: string; amount: string };
const line = (l: Stored): PnlLine => ({ coaCode: l.coaCode, name: l.name, category: l.category as PnlLine["category"], amount: money(l.amount) });

/** Each company's profit and loss over the months: a closed month from its latest snapshot, an open one from the books. */
export async function loadActualPnl(entities: readonly string[], year: number, months: readonly number[]) {
  const [periods, snapshots] = await Promise.all([
    db.select().from(schema.fiscalPeriod).where(eq(schema.fiscalPeriod.year, year)),
    db.select().from(schema.pnlSnapshot).where(eq(schema.pnlSnapshot.year, year)).orderBy(desc(schema.pnlSnapshot.version)),
  ]);
  const fromSnapshot = new Set<string>();
  const companies: EntityPnl[] = await Promise.all(
    entities.map(async (entity) => {
      const parts = await Promise.all(
        months.map(async (month) => {
          const closed = periods.some((p) => p.entityCode === entity && p.month === month && p.status === "closed");
          const snapshot = closed ? snapshots.find((s) => s.entityCode === entity && s.month === month) : undefined;
          if (!snapshot) return loadMonthPnl(db, entity, year, month);
          fromSnapshot.add(`${entity}:${month}`);
          return {
            lines: snapshot.data.lines.map(line),
            intercompany: (snapshot.data.intercompany ?? []).map((l): IntercompanyAmount => ({ ...line(l), counterparty: l.counterparty })),
          };
        }),
      );
      return { entity, lines: parts.flatMap((p) => p.lines), intercompany: parts.flatMap((p) => p.intercompany) };
    }),
  );
  return { companies, closedMonths: fromSnapshot.size };
}

/** The RKA's plan for the same companies and months, as statement lines: the year's locked version, else its open one. */
export async function loadBudgetPnl(entities: readonly string[], year: number, months: readonly number[]): Promise<{ lines: PnlLine[]; found: boolean }> {
  const versions = await db.select({ id: schema.budgetVersion.id, fiscalYear: schema.budgetVersion.fiscalYear, status: schema.budgetVersion.status }).from(schema.budgetVersion);
  const version = chargeableVersion(versions, year);
  if (!version || !entities.length || !months.length) return { lines: [], found: !!version };
  const rows = await db
    .select({ coaCode: schema.budgetLine.coaCode, name: schema.coaAccount.name, category: schema.coaAccount.category, amount: schema.budgetLineAmount.amount })
    .from(schema.budgetLineAmount)
    .innerJoin(schema.budgetLine, eq(schema.budgetLine.id, schema.budgetLineAmount.lineId))
    .innerJoin(schema.coaAccount, eq(schema.coaAccount.code, schema.budgetLine.coaCode))
    .where(and(eq(schema.budgetLine.versionId, version.id), inArray(schema.budgetLine.entityCode, [...entities]), inArray(schema.budgetLineAmount.month, [...months])));
  return { found: true, lines: rows.filter((r) => r.category !== "CAPEX" && r.category !== "BALANCE_SHEET").map(line) };
}
