"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { INVOICE_ACTIONS, PPH_TYPES, can, dueDate, invoiceAmounts, invoiceProblem, money, parseIdr, type InvoiceAction, type InvoiceProblem, type Money } from "@estrada/domain";
import { applyInvoiceStep, billableTermins, covers, tellInvoice } from "@/lib/invoice";
import { todayJakarta } from "@/lib/payment";
import { requireUser, type CurrentUser } from "@/lib/session";
import { loadOrg, WorkflowError } from "@/lib/workflow";

type Result = { ok: boolean; message: string; id?: string };

const REFUSAL = "Invoice dibuat oleh Accounting.";
const MESSAGE: Record<InvoiceProblem, string> = {
  deduction: "Penalti dan denda tidak boleh negatif.",
  dpp: "Penalti dan denda tidak boleh menghabiskan nilai termin.",
  pph: "Isi tarif PPh sesuai jenisnya (0 untuk Tanpa PPh).",
  date: "Tanggal invoice tidak boleh sesudah hari ini.",
};
const Form = z.object({
  dealId: z.string().uuid(),
  terminNo: z.number().int().min(1),
  description: z.string().trim().min(3).max(500),
  penalty: z.string().max(40),
  fine: z.string().max(40),
  pphType: z.enum(PPH_TYPES),
  pphRate: z.string().regex(/^\d{1,3}([.,]\d{1,2})?$/),
  invoicedOn: z.string().max(10),
  bankAccountId: z.string().max(40),
});
export type InvoiceForm = z.input<typeof Form>;

const amount = (raw: string): Money | null => {
  try {
    return parseIdr(raw || "0");
  } catch {
    return null;
  }
};

/** Checks the form and works out the stored figures from the termin and the customer. */
async function figures(user: CurrentUser, v: z.output<typeof Form>, billed: string, entity: string, customerId: string) {
  const [penalty, fine] = [amount(v.penalty), amount(v.fine)];
  if (!penalty || !fine) return { refused: "Penalti atau denda tidak terbaca." };
  const pphRate = money(v.pphRate.replace(",", "."));
  const problem = invoiceProblem({ billed: money(billed), penalty, fine, pphRate, pphType: v.pphType, invoicedOn: v.invoicedOn, today: todayJakarta() });
  if (problem) return { refused: MESSAGE[problem] };
  if (!covers(user, entity)) return { refused: "Entitas di luar cakupan posisi Anda." };
  const [customer] = await db.select().from(schema.customer).where(eq(schema.customer.id, customerId));
  if (!customer || !customer.active) return { refused: "Customer deal ini tidak aktif di Master Customer." };
  if (v.bankAccountId) {
    const [bank] = await db.select().from(schema.companyBankAccount).where(eq(schema.companyBankAccount.id, v.bankAccountId));
    if (!bank || !bank.active || bank.entityCode !== entity) return { refused: "Pilih rekening aktif milik entitas invoice ini." };
  }
  const a = invoiceAmounts({ billed: money(billed), penalty, fine, wapu: customer.wapu, pphRate });
  return {
    values: {
      description: v.description,
      billed,
      penalty: penalty.toFixed(2),
      fine: fine.toFixed(2),
      wapu: customer.wapu,
      pphType: v.pphType,
      pphRate: pphRate.toFixed(2),
      dpp: a.dpp.toFixed(2),
      ppn: a.ppn.toFixed(2),
      pph: a.pph.toFixed(2),
      total: a.total.toFixed(2),
      receivable: a.receivable.toFixed(2),
      invoicedOn: v.invoicedOn,
      dueOn: dueDate(v.invoicedOn, customer.paymentTermDays),
      termDays: customer.paymentTermDays,
      bankAccountId: v.bankAccountId || null,
      updatedAt: new Date(),
    },
  };
}

/** Raises a draft invoice for a billable termin, or changes one that is still a draft. */
export async function saveInvoice(id: string | null, input: InvoiceForm): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "invoice.create", null, await loadOrg())) return { ok: false, message: REFUSAL };
  const parsed = Form.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Periksa isian invoice." };
  const v = parsed.data;

  if (id) {
    const [r] = await db.select().from(schema.invoice).where(eq(schema.invoice.id, id));
    if (!r) return { ok: false, message: "Invoice tidak ditemukan." };
    if (r.state !== "draft") return { ok: false, message: "Hanya draft yang dapat diubah." };
    const made = await figures(user, v, r.billed, r.entityCode, r.customerId);
    if (!made.values) return { ok: false, message: made.refused };
    await db.transaction(async (tx) => {
      await tx.update(schema.invoice).set(made.values).where(and(eq(schema.invoice.id, id), eq(schema.invoice.state, "draft")));
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "invoice.update", subjectType: "invoice", subjectId: id, before: r, after: made.values });
    });
    revalidatePath(`/invoice/${id}`);
    return { ok: true, message: "Invoice disimpan.", id };
  }

  const termin = (await billableTermins()).find((t) => t.dealId === v.dealId && t.no === v.terminNo);
  if (!termin) return { ok: false, message: "Termin ini sudah ditagih atau tidak dapat ditagih." };
  if (!termin.customerId) return { ok: false, message: "Hubungkan deal ke Master Customer sebelum menagih." };
  const made = await figures(user, v, termin.amount, termin.entity, termin.customerId);
  if (!made.values) return { ok: false, message: made.refused };
  const record = { ...made.values, entityCode: termin.entity, customerId: termin.customerId, projectId: termin.projectId, dealId: termin.dealId, terminNo: termin.no, createdBy: user.id };
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(schema.invoice).values(record).returning();
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "invoice.create", subjectType: "invoice", subjectId: created!.id, after: record });
    return created!;
  });
  await tellInvoice(row, "invoice_created", user.id);
  revalidatePath("/invoice");
  return { ok: true, message: "Draft invoice disimpan.", id: row.id };
}

export async function runInvoiceAction(id: string, action: InvoiceAction, note: string): Promise<Result> {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(id).success || !INVOICE_ACTIONS.includes(action)) return { ok: false, message: "Permintaan tidak valid." };
  const org = await loadOrg();
  if (!can(user.actor, "invoice.create", null, org) && !can(user.actor, "invoice.approve", null, org)) return { ok: false, message: "Anda tidak berwenang atas langkah ini." };
  try {
    const done = await applyInvoiceStep(user, id, action, note.slice(0, 1000));
    revalidatePath("/invoice", "layout");
    return { ok: true, message: `${done.number ?? "Invoice"}: ${done.state.toLowerCase()}.${done.warning ? ` ${done.warning}` : ""}` };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}
