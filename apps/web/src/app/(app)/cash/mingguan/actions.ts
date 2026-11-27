"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { CASH_ENTRY_KINDS, can, cashEntryProblem, parseIdr, type CashEntryProblem } from "@estrada/domain";
import { assertOpenPeriod } from "@/lib/period";
import { todayJakarta } from "@/lib/payment";
import { requireUser, type CurrentUser } from "@/lib/session";
import { loadOrg, WorkflowError } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const REFUSAL = "Transaksi kas dicatat oleh Cash Management.";
const MESSAGE: Record<CashEntryProblem, string> = {
  amount: "Isi nominal lebih dari 0.",
  date: "Tanggal tidak boleh setelah hari ini.",
  description: "Tulis keterangan transaksi.",
  account: "Pilih akun COA untuk biaya.",
};
const Input = z.object({
  entityCode: z.string().min(1, "Pilih entitas.").max(20),
  onDate: z.string().max(10),
  kind: z.enum(CASH_ENTRY_KINDS),
  amount: z.string().max(40),
  coaCode: z.string().trim().max(20),
  description: z.string().trim().max(300),
});
export type CashEntryInput = z.input<typeof Input>;

const covers = (user: CurrentUser, entity: string) => user.actor.entities.includes("*") || user.actor.entities.includes(entity);
const refresh = () => revalidatePath("/cash/mingguan");

/** Records cash moved outside invoices and payment requests, dated in an open month. */
export async function recordCashEntry(input: CashEntryInput): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "cash.record", null, await loadOrg())) return { ok: false, message: REFUSAL };
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const v = parsed.data;
  let amount;
  try {
    amount = parseIdr(v.amount);
  } catch {
    return { ok: false, message: "Nominal tidak terbaca." };
  }
  const coaCode = v.kind === "cost" ? v.coaCode || null : null;
  const problem = cashEntryProblem({ amount, date: v.onDate, today: todayJakarta(), description: v.description, kind: v.kind, coaCode });
  if (problem) return { ok: false, message: MESSAGE[problem] };
  if (!covers(user, v.entityCode)) return { ok: false, message: "Entitas tidak dikenal." };
  const [entity] = await db.select().from(schema.companyEntity).where(eq(schema.companyEntity.code, v.entityCode));
  if (!entity?.active) return { ok: false, message: "Entitas tidak dikenal." };
  if (coaCode) {
    const [account] = await db.select({ code: schema.coaAccount.code }).from(schema.coaAccount).where(eq(schema.coaAccount.code, coaCode));
    if (!account) return { ok: false, message: "Akun COA tidak dikenal." };
  }
  try {
    const warning = await db.transaction(async (tx) => {
      const note = await assertOpenPeriod(tx, v.entityCode, v.onDate);
      const values = { entityCode: v.entityCode, onDate: v.onDate, kind: v.kind, amount: amount.toFixed(2), coaCode, description: v.description, createdBy: user.id };
      const [row] = await tx.insert(schema.cashEntry).values(values).returning({ id: schema.cashEntry.id });
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "cash.entry", subjectType: "cash_entry", subjectId: row!.id, after: values });
      return note;
    });
    refresh();
    return { ok: true, message: warning ? `Transaksi dicatat. ${warning}` : "Transaksi dicatat." };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}

/** Takes a typed movement back, with the reason; a closed month refuses it too. */
export async function reverseCashEntry(id: string, reason: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "cash.record", null, await loadOrg())) return { ok: false, message: REFUSAL };
  const parsed = z.object({ id: z.string().uuid(), reason: z.string().trim().min(5).max(500) }).safeParse({ id, reason });
  if (!parsed.success) return { ok: false, message: "Tulis alasan pembatalan." };
  try {
    await db.transaction(async (tx) => {
      const [entry] = await tx.select().from(schema.cashEntry).where(eq(schema.cashEntry.id, parsed.data.id)).for("update");
      if (!entry || !covers(user, entry.entityCode)) throw new WorkflowError("Transaksi tidak ditemukan.");
      if (entry.reversedAt) throw new WorkflowError("Transaksi ini sudah dibatalkan.");
      await assertOpenPeriod(tx, entry.entityCode, entry.onDate);
      const patch = { reversedAt: new Date(), reversedBy: user.id, reversalReason: parsed.data.reason };
      await tx.update(schema.cashEntry).set(patch).where(eq(schema.cashEntry.id, entry.id));
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "cash.entry_reverse", subjectType: "cash_entry", subjectId: entry.id, before: entry, after: patch });
    });
    refresh();
    return { ok: true, message: "Transaksi dibatalkan." };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}
