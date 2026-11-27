"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { DOCUMENT_KINDS, documentProblem, money, parseIdr, paymentActions, type PaymentAction, PPH_TYPES, isVendorBill, pphOf } from "@estrada/domain";
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
  partnerId: z.string().max(50),
  vendorInvoiceNo: z.string().trim().max(100),
  billDate: z.string().refine((s) => s === "" || DATE.test(s), "Tanggal invoice vendor tidak valid"),
  projectId: z.union([z.literal(""), z.string().uuid()]),
  purchaseOrderId: z.union([z.literal(""), z.string().uuid()]).default(""),
  pphType: z.union([z.literal(""), z.enum(PPH_TYPES)]),
  pphRate: z.string().max(10),
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
    const [gross, ppn] = [amountOf(v.gross, "Nominal"), amountOf(v.ppn, "PPN")];
    // With a PPh type the server works the amount out itself; an older request keeps its typed figure.
    let pph: string;
    let pphRate: string | null = null;
    if (v.pphType) {
      const rate = /^\d{1,3}([.,]\d{1,2})?$/.test(v.pphRate) ? money(v.pphRate.replace(",", ".")) : null;
      if (!rate || rate.gt(100) || (v.pphType === "none") !== rate.isZero()) return { ok: false, message: "Isi tarif PPh sesuai jenisnya." };
      pph = pphOf(money(gross), rate).toFixed(2);
      pphRate = rate.toFixed(2);
    } else pph = amountOf(v.pph, "PPh");
    if (money(pph).gt(money(gross).plus(money(ppn)))) return { ok: false, message: "PPh melebihi tagihan." };
    if (v.budgetLineId) {
      const { lines } = await lineOptions(user.actor, await activeYear());
      if (!lines.some((l) => l.id === v.budgetLineId && l.entity === v.entity)) return { ok: false, message: "Baris RKA tidak tersedia untuk Anda." };
    }
    // A picked partner must be in the master, and gives the payee its name.
    const [partner] = v.partnerId ? await db.select().from(schema.partner).where(eq(schema.partner.id, v.partnerId)) : [];
    if (v.partnerId && !partner) return { ok: false, message: "Mitra tidak ada di Master Mitra." };
    if (partner && !partner.active) {
      const [held] = id ? await db.select().from(schema.paymentRequest).where(eq(schema.paymentRequest.id, id)) : [];
      if (held?.partnerId !== partner.id) return { ok: false, message: "Mitra sudah nonaktif di Master Mitra." };
    }
    // The vendor bill fields belong to a payment that names a Mitra.
    const bill = isVendorBill({ kind: v.kind, partnerId: partner?.id });
    if (bill && v.projectId) {
      const [project] = await db
        .select({ entity: schema.pipelineDeal.entityCode })
        .from(schema.project)
        .innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.project.dealId))
        .where(eq(schema.project.id, v.projectId));
      if (!project || project.entity !== v.entity) return { ok: false, message: "Proyek tidak ada pada entitas ini." };
    }
    if (bill && v.purchaseOrderId) {
      const [order] = await db
        .select({ entity: schema.purchaseOrder.entityCode, partnerId: schema.purchaseOrder.partnerId, state: schema.purchaseOrder.state, budgetLineId: schema.purchaseRequest.budgetLineId })
        .from(schema.purchaseOrder)
        .innerJoin(schema.purchaseRequest, eq(schema.purchaseRequest.id, schema.purchaseOrder.requestId))
        .where(eq(schema.purchaseOrder.id, v.purchaseOrderId));
      if (!order || order.state !== "approved" || order.entity !== v.entity || order.partnerId !== partner!.id) return { ok: false, message: "Pilih PO disetujui milik mitra dan entitas ini." };
      if (order.budgetLineId !== v.budgetLineId) return { ok: false, message: "Baris RKA harus sama dengan baris pada permintaan pengadaan PO ini." };
    }
    if (bill && v.vendorInvoiceNo) {
      const [twin] = await db
        .select({ id: schema.paymentRequest.id, number: schema.paymentRequest.number })
        .from(schema.paymentRequest)
        .where(
          and(
            eq(schema.paymentRequest.partnerId, partner!.id),
            eq(schema.paymentRequest.kind, "payment"),
            sql`lower(${schema.paymentRequest.vendorInvoiceNo}) = ${v.vendorInvoiceNo.toLowerCase()}`,
            id ? ne(schema.paymentRequest.id, id) : undefined,
          ),
        )
        .limit(1);
      if (twin) return { ok: false, message: `Invoice ${v.vendorInvoiceNo} dari mitra ini sudah dicatat${twin.number ? ` (${twin.number})` : ""}.` };
    }
    const values = {
      kind: v.kind,
      entityCode: v.entity,
      project: v.project || null,
      budgetLineId: v.budgetLineId || null,
      description: v.description,
      partnerId: partner?.id ?? null,
      vendorInvoiceNo: bill ? v.vendorInvoiceNo || null : null,
      billDate: bill ? v.billDate || null : null,
      projectId: bill ? v.projectId || null : null,
      purchaseOrderId: bill ? v.purchaseOrderId || null : null,
      pphType: v.pphType || null,
      pphRate,
      payeeName: partner?.name ?? (v.payeeName || null),
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
      before: { gross: r.gross, ppn: r.ppn, pph: r.pph, budgetLineId: r.budgetLineId, partnerId: r.partnerId, description: r.description },
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
  verify: "Pemeriksaan selesai; diteruskan untuk persetujuan.",
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
  let warning: string | null = null;
  try {
    ({ warning } = await applyPaymentTransition(user.actor, id, action, {
      comment: String(form.get("comment") ?? "") || undefined,
      scheduledOn: String(form.get("scheduledOn") ?? "") || undefined,
      bankAccountId: String(form.get("bankAccountId") ?? "") || undefined,
      paidOn: String(form.get("paidOn") ?? "") || undefined,
      proof: proof instanceof File && proof.size ? proof : undefined,
    }));
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
  revalidatePath("/pembayaran");
  revalidatePath(`/pembayaran/${id}`);
  return { ok: true, message: warning ? `${DONE[action]} ${warning}` : DONE[action] };
}
