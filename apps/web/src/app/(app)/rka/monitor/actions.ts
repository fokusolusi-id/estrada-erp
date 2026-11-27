"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { ADJUSTMENT_KINDS, adjustmentProblem, can, parseIdr, type AdjustmentProblem } from "@estrada/domain";
import { assertOpenPeriod } from "@/lib/period";
import { reportVersions } from "@/lib/rka";
import { todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg, WorkflowError } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const MESSAGE: Record<Exclude<AdjustmentProblem, "year">, string> = {
  amount: "Isi nominal selain nol.",
  date: "Tanggal tidak boleh sesudah hari ini.",
  reason: "Tulis alasannya, minimal 10 karakter.",
};
const Input = z.object({
  entity: z.string().min(1).max(40),
  unit: z.string().min(1).max(40),
  coaCode: z.string().min(1).max(20),
  date: z.string().max(10),
  kind: z.enum(ADJUSTMENT_KINDS),
  amount: z.string().max(40),
  reason: z.string().max(1000),
});

/** Records an accrual or correction beside the automatic feed. A mistake is reversed with an opposite entry. */
export async function saveAdjustment(input: z.input<typeof Input>): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "actual.adjust", null, await loadOrg())) return { ok: false, message: "Penyesuaian dicatat oleh Accounting." };
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Periksa isian." };
  const v = parsed.data;
  if (!user.actor.entities.includes("*") && !user.actor.entities.includes(v.entity)) return { ok: false, message: "Entitas di luar cakupan posisi Anda." };
  let amount: string;
  try {
    amount = parseIdr(v.amount).toFixed(2);
  } catch {
    return { ok: false, message: MESSAGE.amount };
  }
  const versions = await reportVersions();
  const version = versions.find((x) => x.status === "locked") ?? versions[0];
  if (!version) return { ok: false, message: "Belum ada siklus RKA." };
  const problem = adjustmentProblem({ date: v.date, amount, reason: v.reason, today: todayJakarta(), year: version.fiscalYear });
  if (problem) return { ok: false, message: problem === "year" ? `Tanggal di luar tahun anggaran ${version.fiscalYear}.` : MESSAGE[problem] };
  const [[entity], [unit], [coa]] = await Promise.all([
    db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.code, v.entity)),
    db.select({ code: schema.orgUnit.code }).from(schema.orgUnit).where(eq(schema.orgUnit.code, v.unit)),
    db.select({ code: schema.coaAccount.code }).from(schema.coaAccount).where(eq(schema.coaAccount.code, v.coaCode)),
  ]);
  if (!entity || !unit || !coa) return { ok: false, message: "Entitas, unit atau COA tidak dikenal." };

  const values = { entityCode: v.entity, unitCode: v.unit, coaCode: v.coaCode, datedOn: v.date, kind: v.kind, amount, reason: v.reason.trim(), authorId: user.id };
  try {
    const warning = await db.transaction(async (tx) => {
      // An adjustment is a posting: a closed month refuses it.
      const note = await assertOpenPeriod(tx, v.entity, v.date);
      const [row] = await tx.insert(schema.actualAdjustment).values(values).returning({ id: schema.actualAdjustment.id });
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "actual.adjust", subjectType: "actual_adjustment", subjectId: row!.id, after: values });
      return note;
    });
    revalidatePath("/rka", "layout");
    return { ok: true, message: warning ? `Penyesuaian disimpan. ${warning}` : "Penyesuaian disimpan." };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}
