"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { balanceProblem, can, parseIdr, type BalanceTotals } from "@estrada/domain";
import { assertOpenPeriod } from "@/lib/period";
import { todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg, WorkflowError } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const REFUSAL = "Total neraca diisi Accounting & Tax.";
const Amount = z.string().max(40);
const Input = z.object({
  entityCode: z.string().min(1).max(20),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pilih bulan."),
  currentAssets: Amount,
  totalAssets: Amount,
  currentLiabilities: Amount,
  totalLiabilities: Amount,
  equity: Amount,
});
export type BalanceInput = z.input<typeof Input>;

/** Accounting types a company's month-end totals; a closed month keeps what it closed with. */
export async function saveBalanceSheet(input: BalanceInput): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "balance.record", null, await loadOrg())) return { ok: false, message: REFUSAL };
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const v = parsed.data;
  if (v.period > todayJakarta().slice(0, 7)) return { ok: false, message: "Bulan belum berjalan." };
  let totals: BalanceTotals;
  try {
    const read = (s: string) => parseIdr(s.trim() || "0");
    totals = { currentAssets: read(v.currentAssets), totalAssets: read(v.totalAssets), currentLiabilities: read(v.currentLiabilities), totalLiabilities: read(v.totalLiabilities), equity: read(v.equity) };
  } catch {
    return { ok: false, message: "Nominal tidak terbaca." };
  }
  const problem = balanceProblem(totals);
  if (problem) return { ok: false, message: problem === "negative" ? "Aset dan liabilitas tidak boleh negatif." : "Bagian lancar tidak boleh melebihi totalnya." };
  if (!(user.actor.entities.includes("*") || user.actor.entities.includes(v.entityCode))) return { ok: false, message: "Entitas tidak dikenal." };
  const [year, month] = [Number(v.period.slice(0, 4)), Number(v.period.slice(5, 7))];
  try {
    const warning = await db.transaction(async (tx) => {
      const [entity] = await tx.select().from(schema.companyEntity).where(eq(schema.companyEntity.code, v.entityCode));
      if (!entity) throw new WorkflowError("Entitas tidak dikenal.");
      const note = await assertOpenPeriod(tx, v.entityCode, `${v.period}-01`);
      const key = and(eq(schema.balanceSheet.entityCode, v.entityCode), eq(schema.balanceSheet.year, year), eq(schema.balanceSheet.month, month));
      const [before] = await tx.select().from(schema.balanceSheet).where(key);
      const values = {
        entityCode: v.entityCode, year, month, currentAssets: totals.currentAssets.toFixed(2), totalAssets: totals.totalAssets.toFixed(2),
        currentLiabilities: totals.currentLiabilities.toFixed(2), totalLiabilities: totals.totalLiabilities.toFixed(2), equity: totals.equity.toFixed(2),
        updatedBy: user.id, updatedAt: new Date(),
      };
      await tx.insert(schema.balanceSheet).values(values).onConflictDoUpdate({ target: [schema.balanceSheet.entityCode, schema.balanceSheet.year, schema.balanceSheet.month], set: values });
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "closing.balance", subjectType: "balance_sheet", subjectId: `${v.entityCode}:${v.period}`, before: before ?? null, after: values });
      return note;
    });
    revalidatePath("/closing");
    const balanced = totals.totalAssets.eq(totals.totalLiabilities.plus(totals.equity));
    return { ok: true, message: [balanced ? "Neraca disimpan." : "Neraca disimpan, tetapi belum seimbang.", warning].filter(Boolean).join(" ") };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}
