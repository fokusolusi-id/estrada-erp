import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { ZERO, allocateProjectOpex, allocateShared, chargeableVersion, money, profitability, sum, type Category, type Money } from "@estrada/domain";
import { loadAllocation } from "./allocation";
import { loadPortfolio } from "./portfolio";

/** The corporate rate when the year's cash assumptions have none (sheet 22_Assumptions). */
const DEFAULT_TAX = "0.22";

/** Each company's OPEX for the year in the RKA, after shared costs are split between companies. */
async function rkaOpex(year: number) {
  const versions = await db.select().from(schema.budgetVersion);
  const version = chargeableVersion(versions, year);
  if (!version) return null;
  const [rows, allocation] = await Promise.all([
    db
      .select({ id: schema.budgetLine.id, entity: schema.budgetLine.entityCode, category: schema.coaAccount.category, amount: schema.budgetLineAmount.amount })
      .from(schema.budgetLineAmount)
      .innerJoin(schema.budgetLine, eq(schema.budgetLine.id, schema.budgetLineAmount.lineId))
      .innerJoin(schema.coaAccount, eq(schema.coaAccount.code, schema.budgetLine.coaCode))
      .where(and(eq(schema.budgetLine.versionId, version.id), eq(schema.coaAccount.category, "OPEX"))),
    loadAllocation(version.id),
  ]);
  // One figure per line is enough: the split is by company, not by month.
  const lines = [...Map.groupBy(rows, (r) => r.id)].map(([id, list]) => ({ id, entity: list[0]!.entity, category: list[0]!.category as Category, months: [sum(list.map((r) => money(r.amount)))] as Money[] }));
  const by = new Map<string, Money>();
  for (const l of allocateShared(lines as never, allocation.rules, allocation.ctx).lines as unknown as typeof lines) by.set(l.entity, (by.get(l.entity) ?? ZERO).plus(l.months[0]!));
  return by;
}

export async function loadProfitability(entities: readonly string[], year: number, today: string) {
  // OPEX is shared over all of a company's running projects, so the whole portfolio of the shown companies is read.
  const [projects, opex, [setting]] = await Promise.all([
    loadPortfolio(entities, today),
    rkaOpex(year),
    db.select({ taxRate: schema.cashSetting.taxRate }).from(schema.cashSetting).where(eq(schema.cashSetting.fiscalYear, year)),
  ]);
  const shares = opex ? allocateProjectOpex(opex, projects) : new Map<string, Money>();
  const taxRate = money(setting?.taxRate ?? DEFAULT_TAX);
  const rows = projects
    .filter((p) => p.stage !== "drop")
    .map((p) => {
      const share = shares.get(p.id) ?? null;
      return { id: p.id, name: p.name, customer: p.customer, entity: p.entity, stage: p.stage, contract: p.contract, cogs: p.cogs, opex: share, ...profitability(p.contract, p.cogs, share, taxRate) };
    });
  return { rows, taxRate, hasRka: !!opex };
}
