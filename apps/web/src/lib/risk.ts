import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { nextReview, riskFromWarning, riskScore } from "@estrada/domain";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type NewRisk = Omit<typeof schema.risk.$inferInsert, "code" | "nextReviewOn">;

/** Adds a risk with its RSK number and first review date. */
export async function insertRisk(tx: Tx, values: NewRisk, today: string, userId: string) {
  const [n] = await tx.execute<{ n: string }>(sql`select nextval('risk_code_seq')::text as n`);
  const [row] = await tx
    .insert(schema.risk)
    .values({ ...values, code: `RSK-${n!.n.padStart(4, "0")}`, nextReviewOn: nextReview(today) })
    .returning();
  await tx.insert(schema.riskLog).values({ riskId: row!.id, kind: "created", note: values.ewRule ? `Dibuat dari peringatan ${values.ewRule}.` : "", newScore: riskScore(values.likelihood, values.impact), userId });
  return row!;
}

/** A Critical warning opens a risk, unless one for that rule is still live (P3-M3 rule 3). */
export async function openRiskFromWarning(code: string, subject: string, assignees: readonly string[], today: string) {
  const values = riskFromWarning({ code, subject, assignees, today });
  if (!values) return null;
  return db.transaction(async (tx) => {
    const [live] = await tx
      .select({ id: schema.risk.id })
      .from(schema.risk)
      .where(and(eq(schema.risk.ewRule, code), inArray(schema.risk.status, ["identified", "in_progress", "mitigated"])))
      .limit(1);
    return live ? null : insertRisk(tx, values, today, values.ownerUserId);
  });
}
