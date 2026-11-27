"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { canActOnAlert, canRunCheck, nextAlertStep, type AlertAction, type AlertStatus } from "@estrada/domain";
import { runEarlyWarning } from "@/lib/early-warning";
import { todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { WorkflowError, loadOrg } from "@/lib/workflow";

type Result = { ok: boolean; message: string };
const REFUSAL = "Peringatan ini ditangani pemiliknya, Head FRM atau Direktur.";

export async function runAlertAction(id: string, action: AlertAction, note: string): Promise<Result> {
  const user = await requireUser();
  const parsed = z.object({ id: z.string().uuid(), action: z.enum(["ack", "resolve", "false_positive"]), note: z.string().trim().max(500) }).safeParse({ id, action, note });
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const v = parsed.data;
  const org = await loadOrg();
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx.select().from(schema.earlyWarning).where(eq(schema.earlyWarning.id, v.id)).for("update");
      if (!row || !canActOnAlert(user.actor, row, org)) throw new WorkflowError(REFUSAL);
      const step = nextAlertStep(row.status as AlertStatus, v.action, v.note);
      if (!step.ok) throw new WorkflowError(step.problem === "note" ? "Tulis catatan penyelesaian." : "Peringatan ini sudah ditutup atau diterima.");
      const patch = {
        status: step.to,
        updatedAt: new Date(),
        ...(v.action === "ack" ? { acknowledgedBy: user.id, acknowledgedAt: new Date() } : { closedBy: user.id, closedOn: todayJakarta(), note: v.note }),
      };
      await tx.update(schema.earlyWarning).set(patch).where(eq(schema.earlyWarning.id, row.id));
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: `ew.${v.action}`, subjectType: "early_warning", subjectId: row.id, before: { status: row.status }, after: { status: step.to, ...(v.note ? { note: v.note } : {}) } });
    });
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
  revalidatePath("/peringatan");
  return { ok: true, message: "Disimpan." };
}

/** The daily check, run now. */
export async function checkWarnings(): Promise<Result> {
  const user = await requireUser();
  if (!canRunCheck(user.actor, await loadOrg())) return { ok: false, message: "Pemeriksaan dijalankan Finance atau Head FRM." };
  const done = await runEarlyWarning();
  await db.insert(schema.auditLog).values({ actorUserId: user.id, action: "ew.check", subjectType: "early_warning", subjectId: todayJakarta(), after: done });
  revalidatePath("/peringatan");
  return { ok: true, message: `Selesai: ${done.opened} baru, ${done.cleared} pulih, ${done.escalated} dieskalasi.` };
}
