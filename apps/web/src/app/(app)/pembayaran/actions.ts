"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { DOCUMENT_KINDS, documentProblem, money, parseIdr, paymentActions, type PaymentAction } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { activeYear } from "@/lib/fiscal-year";
import { applyPaymentTransition, asLike, lineOptions, storeDocument } from "@/lib/payment";
import { loadOrg, WorkflowError } from "@/lib/workflow";
import type { PaymentFormValues } from "@/components/erp/payment-form";

type Result = { ok: boolean; message: string; id?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const FormSchema = z.object({
  kind: z.enum(["payment", "cash_advance"]),
  entity: z.string().min(1, "Pilih entitas"),
  project: z.string().trim().max(200),
  budgetLineId: z.string(),
  description: z.string().trim().max(1000),
  payeeName: z.string().trim().max(200),
  payeeBank: z.string().trim().max(60),
  payeeAccount: z.string().trim().max(40),
  dueOn: z.string().refine((s) => s === "" || DATE.test(s), "Tanggal jatuh tempo tidak valid"),
  gross: z.string(),
  ppn: z.string(),
  pph: z.string(),
});

const amountOf = (raw: string, label: string) => {
  try {
    const v = parseIdr(raw || "0");
    if (v.isNegative()) throw new Error();
    return v.toFixed(2);
  } catch {
    throw new WorkflowError(`${label} tidak terbaca.`);
  }
};

/** Saves a new request as Draft, or edits one the requester still holds (Draft or Returned). */
export async function savePayment(id: string | null, values: PaymentFormValues): Promise<Result> {
  const user = await requireUser();
  if (user.actor.role === "admin") return { ok: false, message: "Admin tidak membuat Permintaan Pembayaran." };
  const parsed = FormSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const v = parsed.data;
  const { entities } = user.actor;
  if (!entities.includes("*") && !entities.includes(v.entity)) return { ok: false, message: "Entitas di luar cakupan posisi Anda." };

  try {
    const [gross, ppn, pph] = [amountOf(v.gross, "Nominal"), amountOf(v.ppn, "PPN"), amountOf(v.pph, "PPh")];
    if (money(pph).gt(money(gross).plus(money(ppn)))) return { ok: false, message: "PPh melebihi tagihan." };
    if (v.budgetLineId) {
      const { lines } = await lineOptions(user.actor, await activeYear());
      if (!lines.some((l) => l.id === v.budgetLineId && l.entity === v.entity)) return { ok: false, message: "Baris RKA tidak tersedia untuk Anda." };
    }
    const values = {
      kind: v.kind,
      entityCode: v.entity,
      project: v.project || null,
      budgetLineId: v.budgetLineId || null,
      description: v.description,
      payeeName: v.payeeName || null,
      payeeBank: v.payeeBank || null,
      payeeAccount: v.payeeAccount || null,
      dueOn: v.dueOn || null,
      gross,
      ppn,
      pph,
      updatedAt: new Date(),
    };

    if (!id) {
      const [row] = await db
        .insert(schema.paymentRequest)
        .values({
          ...values,
          requesterId: user.id,
          requesterPositionId: user.activePositionId,
          requesterUnit: user.actor.orgUnit,
          requesterRole: user.actor.role,
        })
        .returning({ id: schema.paymentRequest.id });
      await db.insert(schema.auditLog).values({ actorUserId: user.id, action: "payment.create", subjectType: "payment_request", subjectId: row!.id, after: values });
      revalidatePath("/pembayaran");
      return { ok: true, message: "Draft disimpan. Lampirkan dokumen lalu kirim.", id: row!.id };
    }

    const [r] = await db.select().from(schema.paymentRequest).where(eq(schema.paymentRequest.id, id));
    if (!r || r.requesterId !== user.id) return { ok: false, message: "Permintaan tidak ditemukan." };
    if (r.state !== "draft" && r.state !== "returned") return { ok: false, message: "Permintaan yang sudah dikirim tidak bisa diubah." };
    // A number, once given, stays with its entity.
    if (r.number && r.entityCode !== v.entity) return { ok: false, message: "Entitas tidak bisa diubah setelah permintaan bernomor." };
    await db.update(schema.paymentRequest).set(values).where(eq(schema.paymentRequest.id, id));
    await db.insert(schema.auditLog).values({
      actorUserId: user.id,
      action: "payment.update",
      subjectType: "payment_request",
      subjectId: id,
      before: { gross: r.gross, ppn: r.ppn, pph: r.pph, budgetLineId: r.budgetLineId, description: r.description },
      after: values,
    });
    revalidatePath(`/pembayaran/${id}`);
    return { ok: true, message: "Perubahan disimpan." };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}

const DocSchema = z.object({ requestId: z.string().uuid(), kind: z.enum(DOCUMENT_KINDS) });

/** Attaches one document to a request the requester still holds. */
export async function uploadDocument(form: FormData): Promise<Result> {
  const user = await requireUser();
  const parsed = DocSchema.safeParse({ requestId: form.get("requestId"), kind: form.get("kind") });
  const file = form.get("file");
  if (!parsed.success || !(file instanceof File)) return { ok: false, message: "Pilih jenis dokumen dan file." };
  const problem = documentProblem(file);
  if (problem) return { ok: false, message: problem };
  const [r] = await db.select().from(schema.paymentRequest).where(eq(schema.paymentRequest.id, parsed.data.requestId));
  if (!r || r.requesterId !== user.id) return { ok: false, message: "Permintaan tidak ditemukan." };
  if (r.state !== "draft" && r.state !== "returned") return { ok: false, message: "Dokumen hanya bisa ditambah selama Draft atau Returned." };
  await db.transaction((tx) => storeDocument(tx, r.id, parsed.data.kind, file, user.id));
  await db.insert(schema.auditLog).values({ actorUserId: user.id, action: "payment.document_add", subjectType: "payment_request", subjectId: r.id, after: { kind: parsed.data.kind, file: file.name } });
  revalidatePath(`/pembayaran/${r.id}`);
  return { ok: true, message: "Dokumen dilampirkan." };
}

/** Removes an attachment while the requester still holds the request. The file stays in storage for the audit trail. */
export async function removeDocument(documentId: string): Promise<Result> {
  const user = await requireUser();
  const [d] = await db
    .select({ doc: schema.paymentDocument, request: schema.paymentRequest })
    .from(schema.paymentDocument)
    .innerJoin(schema.paymentRequest, eq(schema.paymentRequest.id, schema.paymentDocument.requestId))
    .where(eq(schema.paymentDocument.id, documentId));
  if (!d || d.request.requesterId !== user.id || d.doc.kind === "proof") return { ok: false, message: "Dokumen tidak ditemukan." };
  if (d.request.state !== "draft" && d.request.state !== "returned") return { ok: false, message: "Dokumen tidak bisa dihapus setelah dikirim." };
  await db.delete(schema.paymentDocument).where(and(eq(schema.paymentDocument.id, documentId), eq(schema.paymentDocument.requestId, d.request.id)));
  await db.insert(schema.auditLog).values({ actorUserId: user.id, action: "payment.document_remove", subjectType: "payment_request", subjectId: d.request.id, before: { kind: d.doc.kind, file: d.doc.fileName, path: d.doc.storagePath } });
  revalidatePath(`/pembayaran/${d.request.id}`);
  return { ok: true, message: "Dokumen dihapus." };
}

const DONE: Record<PaymentAction, string> = {
  submit: "Permintaan dikirim ke atasan.",
  approve: "Permintaan disetujui.",
  return: "Permintaan dikembalikan ke pemohon.",
  verify: "Pemeriksaan selesai; diteruskan ke Head Divisi.",
  schedule: "Pembayaran dijadwalkan.",
  pay: "Pembayaran dicatat sebagai Paid.",
};

/** Moves a request one step: submit, approve, return, verify, schedule or pay. */
export async function runPaymentAction(form: FormData): Promise<Result> {
  const user = await requireUser();
  const id = String(form.get("requestId") ?? "");
  const action = String(form.get("action") ?? "") as PaymentAction;
  if (!(action in DONE)) return { ok: false, message: "Aksi tidak dikenal." };
  const proof = form.get("proof");
  if (action === "pay") {
    if (!(proof instanceof File) || !proof.size) return { ok: false, message: "Lampirkan bukti bayar." };
    const problem = documentProblem(proof);
    if (problem) return { ok: false, message: problem };
  }
  const [r] = await db.select().from(schema.paymentRequest).where(eq(schema.paymentRequest.id, id));
  if (!r || !paymentActions(user.actor, asLike(r), await loadOrg()).includes(action)) return { ok: false, message: "Anda tidak berwenang atas permintaan ini sekarang." };
  try {
    await applyPaymentTransition(user.actor, id, action, {
      comment: String(form.get("comment") ?? "") || undefined,
      scheduledOn: String(form.get("scheduledOn") ?? "") || undefined,
      bankAccountId: String(form.get("bankAccountId") ?? "") || undefined,
      paidOn: String(form.get("paidOn") ?? "") || undefined,
      proof: proof instanceof File && proof.size ? proof : undefined,
    });
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
  revalidatePath("/pembayaran");
  revalidatePath(`/pembayaran/${id}`);
  return { ok: true, message: DONE[action] };
}
