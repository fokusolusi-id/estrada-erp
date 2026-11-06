import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { money, ZERO, type AllocationContext, type Money, type SharedRule } from "@estrada/domain";

/**
 * Everything a report needs to split shared costs for one version: the entities (ESTRADA first), the revenue
 * and head count per entity, and each shared line's rule. Revenue is the whole version's, not the viewer's scope,
 * so every viewer sees the same split.
 */
export async function loadAllocation(versionId: string): Promise<{ ctx: AllocationContext; rules: Map<string, SharedRule> }> {
  const [entities, revenueRows, heads, shared] = await Promise.all([
    db.select().from(schema.companyEntity).where(eq(schema.companyEntity.active, true)),
    db
      .select({ entity: schema.budgetLine.entityCode, amount: schema.budgetLineAmount.amount })
      .from(schema.budgetLine)
      .innerJoin(schema.coaAccount, eq(schema.coaAccount.code, schema.budgetLine.coaCode))
      .innerJoin(schema.budgetLineAmount, eq(schema.budgetLineAmount.lineId, schema.budgetLine.id))
      .where(and(eq(schema.budgetLine.versionId, versionId), eq(schema.coaAccount.category, "Revenue"))),
    db.select().from(schema.entityHeadcount).where(eq(schema.entityHeadcount.versionId, versionId)),
    db
      .select({ id: schema.budgetLine.id, basis: schema.budgetLine.sharedBasis, fixed: schema.budgetLine.sharedFixed })
      .from(schema.budgetLine)
      .where(and(eq(schema.budgetLine.versionId, versionId), isNotNull(schema.budgetLine.sharedBasis))),
  ]);

  const revenue = new Map<string, Money>();
  for (const r of revenueRows) revenue.set(r.entity, (revenue.get(r.entity) ?? ZERO).plus(money(r.amount)));
  const ordered = [...entities.filter((e) => e.costType === "indirect"), ...entities.filter((e) => e.costType !== "indirect")];

  return {
    ctx: {
      entities: ordered.map((e) => e.code),
      revenue,
      headcount: new Map(heads.map((h) => [h.entityCode, h.heads])),
    },
    rules: new Map(shared.map((s) => [s.id, { basis: s.basis!, ...(s.fixed ? { fixed: s.fixed } : {}) }])),
  };
}
