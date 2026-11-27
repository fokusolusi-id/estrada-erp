"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { can, money, parseIdr, receiptProblem, sum, type ReceiptProblem } from "@estrada/domain";
import { assertOpenPeriod } from "@/lib/period";
import { todayJakarta } from "@/lib/payment";
import { requireUser, type CurrentUser } from "@/lib/session";
import { loadOrg, WorkflowError } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const REFUSAL = "Penerimaan dicatat oleh Cash Management.";
const MESSAGE: Record<ReceiptProblem, string> = {
  not_issued: "Penerimaan hanya untuk invoice yang sudah terbit.",
  own_invoice: "Penerima pembayaran tidak boleh pembuat, validator atau penyetuju invoice ini.",
  amount: "Isi nominal lebih dari 0.",
  over: "Total penerimaan tidak boleh melebihi nilai invoice.",
  date: "Tanggal terima harus antara tanggal invoice dan hari ini.",
};
const Input = z.object({
  invoiceId: z.string().uuid(),
  receivedOn: z.string().max(10),
  amount: z.string().max(40),
  bankAccountId: z.string().uuid("Pilih rekening penerima."),
  reference: z.string().trim().min(1, "Isi referensi mutasi bank.").max(100),
  note: z.string().trim().max(500),
});
export type ReceiptInput = z.input<typeof Input>;

const covers = (user: CurrentUser, entity: string) => user.actor.entities.includes("*") || user.actor.entities.includes(entity);
const refresh = (invoiceId: string) => {
  revalidatePath(`/invoice/${invoiceId}`);
  revalidatePath("/piutang");
};

/** Records money received against an issued invoice, dated in an open month. */
export async function recordReceipt(input: ReceiptInput): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "receipt.record", null, await loadOrg())) return { ok: false, message: REFUSAL };
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const v = parsed.data;
  let amount;
  try {
    amount = parseIdr(v.amount);
  } catch {
    return { ok: false, message: "Nominal tidak terbaca." };
  }
  try {
    const warning = await db.transaction(async (tx) => {
      // The invoice row is held, so two receipts cannot together pass its value.
      const [invoice] = await tx.select().from(schema.invoice).where(eq(schema.invoice.id, v.invoiceId)).for("update");
      if (!invoice || !covers(user, invoice.entityCode)) throw new WorkflowError("Invoice tidak ditemukan.");
      const [bank] = await tx.select().from(schema.companyBankAccount).where(eq(schema.companyBankAccount.id, v.bankAccountId));
      if (!bank || !bank.active || bank.entityCode !== invoice.entityCode) throw new WorkflowError("Pilih rekening aktif milik entitas invoice ini.");
      const before = await tx.select({ amount: schema.cashReceipt.amount }).from(schema.cashReceipt).where(and(eq(schema.cashReceipt.invoiceId, invoice.id), isNull(schema.cashReceipt.reversedAt)));
      const problem = receiptProblem(
        { total: money(invoice.total), invoicedOn: invoice.invoicedOn, createdBy: invoice.createdBy, validatedBy: invoice.validatedBy, approvedBy: invoice.approvedBy },
        { amount, received: sum(before.map((r) => money(r.amount))), receivedOn: v.receivedOn, today: todayJakarta(), actorId: user.id, state: invoice.state },
      );
      if (problem) throw new WorkflowError(MESSAGE[problem]);
      const note = await assertOpenPeriod(tx, invoice.entityCode, v.receivedOn);
      const values = { invoiceId: invoice.id, receivedOn: v.receivedOn, amount: amount.toFixed(2), bankAccountId: bank.id, reference: v.reference, note: v.note || null, createdBy: user.id };
      const [row] = await tx.insert(schema.cashReceipt).values(values).returning({ id: schema.cashReceipt.id });
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "receipt.record", subjectType: "cash_receipt", subjectId: row!.id, after: values });
      return note;
    });
    refresh(v.invoiceId);
    return { ok: true, message: warning ? `Penerimaan dicatat. ${warning}` : "Penerimaan dicatat." };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}

/** Takes a receipt back, with the reason; a closed month refuses it too. */
export async function reverseReceipt(id: string, reason: string): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "receipt.record", null, await loadOrg())) return { ok: false, message: REFUSAL };
  const parsed = z.object({ id: z.string().uuid(), reason: z.string().trim().min(5).max(500) }).safeParse({ id, reason });
  if (!parsed.success) return { ok: false, message: "Tulis alasan pembatalan." };
  try {
    const invoiceId = await db.transaction(async (tx) => {
      const [found] = await tx
        .select({ receipt: schema.cashReceipt, entity: schema.invoice.entityCode })
        .from(schema.cashReceipt)
        .innerJoin(schema.invoice, eq(schema.invoice.id, schema.cashReceipt.invoiceId))
        .where(eq(schema.cashReceipt.id, parsed.data.id));
      if (!found || !covers(user, found.entity)) throw new WorkflowError("Penerimaan tidak ditemukan.");
      if (found.receipt.reversedAt) throw new WorkflowError("Penerimaan ini sudah dibatalkan.");
      await assertOpenPeriod(tx, found.entity, found.receipt.receivedOn);
      const patch = { reversedAt: new Date(), reversedBy: user.id, reversalReason: parsed.data.reason };
      await tx.update(schema.cashReceipt).set(patch).where(eq(schema.cashReceipt.id, found.receipt.id));
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "receipt.reverse", subjectType: "cash_receipt", subjectId: found.receipt.id, before: found.receipt, after: patch });
      return found.receipt.invoiceId;
    });
    refresh(invoiceId);
    return { ok: true, message: "Penerimaan dibatalkan." };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}
