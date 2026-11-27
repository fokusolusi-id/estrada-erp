"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { PERIOD_ACTIONS, PERIOD_STATUS_LABEL, can, closingProblem, periodStep, type PeriodAction, type PeriodProblem } from "@estrada/domain";
import { balanceOf, loadMonthPnl } from "@/lib/closing";
import { MONTH_NAMES, lockPeriod } from "@/lib/period";
import { requireUser } from "@/lib/session";
import { loadOrg, WorkflowError } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const REFUSAL = "Anda tidak berwenang mengubah periode ini.";
const MESSAGE: Record<PeriodProblem, string> = {
  not_allowed: REFUSAL,
  wrong_state: "Status periode sudah berubah. Muat ulang halaman.",
  reason_required: "Tulis alasan membuka kembali.",
};
const Input = z.object({
  entity: z.string().min(1).max(40),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  action: z.enum(PERIOD_ACTIONS),
  reason: z.string().trim().max(1000),
});

async function takeSnapshot(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], entity: string, year: number, month: number, userId: string) {
  const sheets = schema.balanceSheet;
  const [row] = await tx.select().from(sheets).where(and(eq(sheets.entityCode, entity), eq(sheets.year, year), eq(sheets.month, month)));
  const balance = balanceOf(row);
  const problem = closingProblem(balance);
  if (problem) throw new WorkflowError(problem === "missing" ? "Accounting belum mengisi total neraca bulan ini (menu Tutup Buku)." : "Neraca bulan ini belum seimbang (menu Tutup Buku).");
  const pnl = await loadMonthPnl(tx, entity, year, month);
  const snapshots = schema.pnlSnapshot;
  const taken = await tx.select({ version: snapshots.version }).from(snapshots).where(and(eq(snapshots.entityCode, entity), eq(snapshots.year, year), eq(snapshots.month, month)));
  await tx.insert(snapshots).values({
    entityCode: entity,
    year,
    month,
    version: Math.max(0, ...taken.map((t) => t.version)) + 1,
    data: {
      lines: pnl.lines.map((l) => ({ ...l, amount: l.amount.toFixed(2) })),
      balance: Object.fromEntries(Object.entries(balance!).map(([k, v]) => [k, v.toFixed(2)])),
    },
    takenBy: userId,
  });
}

/** Moves one PT's month: start or call off closing, close, or reopen with a reason. Every step is audited. */
export async function changePeriod(entity: string, year: number, month: number, action: PeriodAction, reason: string): Promise<Result> {
  const user = await requireUser();
  const parsed = Input.safeParse({ entity, year, month, action, reason });
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const v = parsed.data;
  const org = await loadOrg();
  const rights = { mayClose: can(user.actor, "period.close", null, org), mayReopen: can(user.actor, "period.reopen", null, org), reason: v.reason };
  const covers = user.actor.entities.includes("*") || user.actor.entities.includes(v.entity);
  if (!covers || !(v.action === "reopen" ? rights.mayReopen : rights.mayClose)) return { ok: false, message: REFUSAL };
  const [known] = await db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.code, v.entity));
  if (!known) return { ok: false, message: "Entitas tidak dikenal." };

  const key = and(eq(schema.fiscalPeriod.entityCode, v.entity), eq(schema.fiscalPeriod.year, v.year), eq(schema.fiscalPeriod.month, v.month));
  try {
    const to = await db.transaction(async (tx) => {
      await lockPeriod(tx, v.entity, v.year, v.month);
      const [before] = await tx.select().from(schema.fiscalPeriod).where(key);
      const from = before?.status ?? "open";
      const step = periodStep(from, v.action, rights);
      if ("problem" in step) throw new WorkflowError(MESSAGE[step.problem]);
      const closed = step.to === "closed";
      // Closing needs balanced totals and keeps the month as it stands, in the same transaction.
      if (closed) await takeSnapshot(tx, v.entity, v.year, v.month, user.id);
      const values = { status: step.to, closedBy: closed ? user.id : null, closedAt: closed ? new Date() : null, updatedAt: new Date() };
      await tx
        .insert(schema.fiscalPeriod)
        .values({ entityCode: v.entity, year: v.year, month: v.month, ...values })
        .onConflictDoUpdate({ target: [schema.fiscalPeriod.entityCode, schema.fiscalPeriod.year, schema.fiscalPeriod.month], set: values });
      await tx.insert(schema.auditLog).values({
        actorUserId: user.id,
        action: `period.${v.action}`,
        subjectType: "fiscal_period",
        subjectId: `${v.entity}:${v.year}-${String(v.month).padStart(2, "0")}`,
        before: { status: from },
        after: { status: step.to, ...(v.reason ? { reason: v.reason } : {}) },
      });
      return step.to;
    });
    revalidatePath("/master/periode");
    revalidatePath("/closing");
    return { ok: true, message: `${MONTH_NAMES[v.month - 1]} ${v.year} ${v.entity}: ${PERIOD_STATUS_LABEL[to].toLowerCase()}.` };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}
