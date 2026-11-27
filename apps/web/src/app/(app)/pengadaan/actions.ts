"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, like, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import {
  PO_ACTIONS, canCheckBudget, canRequestPurchase, canWritePo, goodsReceiptProblem, isScmHead, limitFor, money, parseIdr, poNumber, poProblem, poStep, prNumber, sum,
  type EmailTemplate, type PoAction, type PoLike,
} from "@estrada/domain";
import { env } from "@/lib/env";
import { enqueueEmail } from "@/lib/email/outbox";
import { lineOptions, loadSeats, todayJakarta } from "@/lib/payment";
import { requireUser } from "@/lib/session";
import { loadOrg, WorkflowError } from "@/lib/workflow";

type Result = { ok: boolean; message: string };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Seat = Awaited<ReturnType<typeof loadSeats>>[number];

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.");
const amountOf = (s: string) => {
  try {
    return parseIdr(s.trim() || "0");
  } catch {
    throw new WorkflowError("Nominal tidak terbaca.");
  }
};
async function run(work: () => Promise<string>): Promise<Result> {
  try {
    const message = await work();
    revalidatePath("/pengadaan");
    return { ok: true, message };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}
const audit = (tx: Tx, userId: string, action: string, subjectType: string, subjectId: string, before: unknown, after: unknown) =>
  tx.insert(schema.auditLog).values({ actorUserId: userId, action: `procurement.${action}`, subjectType, subjectId, before, after });

/** One email per handoff, without amounts, to the people chosen from the seats (never the one who acted). */
async function tell(template: EmailTemplate, entity: string, actorId: string, pick: (s: Seat) => boolean, payload: { number: string; comment?: string }, also: string[] = []) {
  const seats = (await loadSeats()).filter((s) => s.occupant && (s.entities.includes("*") || s.entities.includes(entity)) && pick(s));
  const ids = new Set([...seats.map((s) => s.occupant!), ...also].filter((id) => id !== actorId));
  for (const userId of ids) {
    const [u] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
    if (!u?.active) continue;
    await enqueueEmail({ template, to: { userId: u.id, email: u.email, name: u.name }, payload: { url: `${env.APP_URL}/pengadaan`, entity, ...payload } });
    await db.insert(schema.notification).values({ userId: u.id, template, link: "/pengadaan" });
  }
}

/** The next running number under a prefix or suffix, held until the transaction ends. */
async function nextSequence(tx: Tx, table: typeof schema.purchaseRequest | typeof schema.purchaseOrder, pattern: string, read: (max: string) => number) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${pattern}))`);
  const rows = await tx.select({ number: table.number }).from(table).where(like(table.number, pattern));
  return Math.max(0, ...rows.map((r) => read(r.number))) + 1;
}

const Request = z.object({ projectId: z.string().uuid("Pilih proyek."), budgetLineId: z.string().uuid("Pilih baris RKA."), description: z.string().trim().min(5, "Tulis spesifikasi kebutuhan.").max(1000), estimate: z.string().max(40) });
export type RequestInput = z.input<typeof Request>;

export async function createPurchaseRequest(input: RequestInput): Promise<Result> {
  const user = await requireUser();
  const parsed = Request.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const v = parsed.data;
  const org = await loadOrg();
  const [project] = await db
    .select({ pm: schema.project.pmUserId, status: schema.project.status, entity: schema.pipelineDeal.entityCode, year: schema.pipelineDeal.fiscalYear })
    .from(schema.project)
    .innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.project.dealId))
    .where(eq(schema.project.id, v.projectId));
  if (!project || !canRequestPurchase(user.actor, project, org)) return { ok: false, message: "Permintaan pengadaan diajukan PM proyek atau PMO." };
  if (project.status === "Drop" || project.status === "Closing") return { ok: false, message: "Proyek ini sudah ditutup." };
  let number = "";
  const result = await run(async () => {
    const estimate = amountOf(v.estimate);
    if (!estimate.gt(0)) throw new WorkflowError("Isi perkiraan nilai lebih dari 0.");
    const { lines } = await lineOptions(user.actor, project.year);
    if (!lines.some((l) => l.id === v.budgetLineId && l.entity === project.entity)) throw new WorkflowError("Baris RKA tidak tersedia untuk Anda pada entitas proyek ini.");
    await db.transaction(async (tx) => {
      const today = todayJakarta();
      const prefix = prNumber(project.entity, today, 0).slice(0, -4);
      number = prNumber(project.entity, today, await nextSequence(tx, schema.purchaseRequest, `${prefix}%`, (n) => Number(n.slice(-4))));
      const values = { number, projectId: v.projectId, entityCode: project.entity, budgetLineId: v.budgetLineId, description: v.description, estimate: estimate.toFixed(2), createdBy: user.id, createdUnit: user.actor.orgUnit };
      const [row] = await tx.insert(schema.purchaseRequest).values(values).returning({ id: schema.purchaseRequest.id });
      await audit(tx, user.id, "pr_create", "purchase_request", row!.id, null, values);
    });
    return `${number} dikirim untuk cek budget.`;
  });
  if (result.ok) await tell("pr_review", project.entity, user.id, (s) => s.role === "bfp" || s.role === "finance", { number });
  return result;
}

/** Finance-Pricing approves or rejects a request against its RKA line (sheet FC05_SCM_Pengadaan step 2). */
export async function decidePurchaseRequest(id: string, approve: boolean, note: string): Promise<Result> {
  const user = await requireUser();
  const parsed = z.object({ id: z.string().uuid(), approve: z.boolean(), note: z.string().trim().max(500) }).safeParse({ id, approve, note });
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const v = parsed.data;
  if (user.actor.role !== "bfp" && user.actor.role !== "finance") return { ok: false, message: "Cek budget dilakukan BFP atau Finance." };
  if (!v.approve && !v.note) return { ok: false, message: "Tulis alasan penolakan." };
  let sent: { number: string; entity: string; by: string } | null = null;
  const result = await run(() =>
    db.transaction(async (tx) => {
      const [before] = await tx.select().from(schema.purchaseRequest).where(eq(schema.purchaseRequest.id, v.id)).for("update");
      if (!before || !canCheckBudget(user.actor, { entity: before.entityCode, createdBy: before.createdBy })) throw new WorkflowError("Permintaan tidak ditemukan atau Anda pengajunya.");
      if (before.state !== "requested") throw new WorkflowError("Permintaan ini sudah diputuskan.");
      const patch = { state: v.approve ? ("approved" as const) : ("rejected" as const), decidedBy: user.id, note: v.note || null, updatedAt: new Date() };
      await tx.update(schema.purchaseRequest).set(patch).where(eq(schema.purchaseRequest.id, v.id));
      await audit(tx, user.id, "pr_decide", "purchase_request", v.id, { state: before.state }, patch);
      sent = { number: before.number, entity: before.entityCode, by: before.createdBy };
      return v.approve ? "Budget disetujui." : "Permintaan ditolak.";
    }),
  );
  const s = sent as { number: string; entity: string; by: string } | null;
  if (result.ok && s) {
    if (v.approve) await tell("pr_approved", s.entity, user.id, (seat) => seat.orgUnit === "SCM", { number: s.number });
    else await tell("pr_rejected", s.entity, user.id, () => false, { number: s.number, comment: v.note }, [s.by]);
  }
  return result;
}

/** What decides a PO's next approver: who wrote and requested it, and whether it passes the requesting unit's limit. */
async function poContext(tx: Tx, po: typeof schema.purchaseOrder.$inferSelect, request: typeof schema.purchaseRequest.$inferSelect): Promise<PoLike> {
  const org = await loadOrg();
  const units = await tx.select({ code: schema.orgUnit.code, limit: schema.orgUnit.approvalLimit }).from(schema.orgUnit);
  const limit = limitFor(request.createdUnit, new Map(units.flatMap((u) => (u.limit ? [[u.code, money(u.limit)] as const] : []))), org);
  const received = (await tx.select({ id: schema.goodsReceipt.id }).from(schema.goodsReceipt).where(eq(schema.goodsReceipt.orderId, po.id))).length > 0;
  return {
    state: po.state,
    entity: po.entityCode,
    createdBy: po.createdBy,
    requestedBy: request.createdBy,
    createdByScmHead: isScmHead(po.createdRole, po.createdUnit),
    overLimit: !!limit && money(po.amount).gt(limit),
    received,
  };
}

const nextApprovers = (po: PoLike) => (s: Seat) =>
  po.state === "head"
    ? po.createdByScmHead
      ? s.role === "division_owner" && s.orgUnit === "PDMS"
      : isScmHead(s.role, s.orgUnit)
    : po.state === "frm"
      ? s.role === "division_owner" && s.orgUnit === "FRM"
      : s.role === "director";

const Order = z.object({
  id: z.string().uuid().nullable(),
  requestId: z.string().uuid("Pilih permintaan pengadaan."),
  partnerId: z.string().min(1, "Pilih mitra.").max(50),
  productId: z.string().max(50),
  description: z.string().trim().min(3, "Isi uraian barang atau jasa.").max(1000),
  qty: z.string().regex(/^\d+([.,]\d{1,2})?$/, "Isi kuantitas."),
  unitPrice: z.string().max(40),
  orderedOn: day,
});
export type OrderInput = z.input<typeof Order>;
const PO_MESSAGE = { qty: "Kuantitas harus lebih dari 0.", price: "Harga satuan harus lebih dari 0.", over_request: "Total PO atas permintaan ini melebihi nilai yang disetujui.", date: "Tanggal PO tidak boleh sesudah hari ini." };

/** SCM writes a PO against an approved request, or corrects a returned one. */
export async function savePurchaseOrder(input: OrderInput): Promise<Result> {
  const user = await requireUser();
  const parsed = Order.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const v = parsed.data;
  const org = await loadOrg();
  const [request] = await db.select().from(schema.purchaseRequest).where(eq(schema.purchaseRequest.id, v.requestId));
  if (!request || !canWritePo(user.actor, request.entityCode, org)) return { ok: false, message: "PO dibuat SCM untuk entitasnya." };
  let sent: { number: string; po: PoLike } | null = null;
  let warning = "";
  const result = await run(async () => {
    const [qty, unitPrice] = [money(v.qty.replace(",", ".")), amountOf(v.unitPrice)];
    return db.transaction(async (tx) => {
      // The request is held, so two orders cannot together pass it.
      const [held] = await tx.select().from(schema.purchaseRequest).where(eq(schema.purchaseRequest.id, v.requestId)).for("update");
      if (!held || held.state !== "approved") throw new WorkflowError("Budget permintaan ini belum disetujui.");
      const [partner] = await tx.select().from(schema.partner).where(eq(schema.partner.id, v.partnerId));
      if (!partner?.active) throw new WorkflowError("Pilih mitra aktif dari Master Mitra.");
      if (v.productId) {
        const [product] = await tx.select().from(schema.partnerProduct).where(eq(schema.partnerProduct.id, v.productId));
        if (product?.partnerId !== partner.id) throw new WorkflowError("Produk bukan milik mitra ini.");
      }
      const others = await tx
        .select({ amount: schema.purchaseOrder.amount })
        .from(schema.purchaseOrder)
        .where(and(eq(schema.purchaseOrder.requestId, held.id), ne(schema.purchaseOrder.state, "cancelled"), v.id ? ne(schema.purchaseOrder.id, v.id) : undefined));
      const problem = poProblem({ qty, unitPrice, estimate: money(held.estimate), ordered: sum(others.map((o) => money(o.amount))), date: v.orderedOn, today: todayJakarta() });
      if (problem) throw new WorkflowError(PO_MESSAGE[problem]);
      const values = {
        partnerId: partner.id, productId: v.productId || null, description: v.description, qty: qty.toFixed(2), unitPrice: unitPrice.toFixed(2),
        amount: qty.times(unitPrice).toFixed(2), orderedOn: v.orderedOn, updatedAt: new Date(),
      };
      if (!partner.npwp) warning = " Perhatian: mitra ini belum punya NPWP.";
      if (v.id) {
        const [before] = await tx.select().from(schema.purchaseOrder).where(eq(schema.purchaseOrder.id, v.id)).for("update");
        if (!before || before.requestId !== held.id || before.state !== "returned") throw new WorkflowError("Hanya PO yang dikembalikan dapat diubah.");
        await tx.update(schema.purchaseOrder).set(values).where(eq(schema.purchaseOrder.id, before.id));
        await audit(tx, user.id, "po_update", "purchase_order", before.id, before, values);
        return `PO disimpan. Kirim ulang bila sudah sesuai.${warning}`;
      }
      const suffix = poNumber(held.entityCode, v.orderedOn, 0).slice(3);
      const number = poNumber(held.entityCode, v.orderedOn, await nextSequence(tx, schema.purchaseOrder, `%${suffix}`, (n) => Number(n.split("/")[0])));
      const record = { ...values, number, requestId: held.id, entityCode: held.entityCode, createdBy: user.id, createdRole: user.actor.role, createdUnit: user.actor.orgUnit };
      const [row] = await tx.insert(schema.purchaseOrder).values(record).returning();
      await audit(tx, user.id, "po_create", "purchase_order", row!.id, null, record);
      sent = { number, po: await poContext(tx, row!, held) };
      return `${number} menunggu persetujuan.${warning}`;
    });
  });
  const s = sent as { number: string; po: PoLike } | null;
  if (result.ok && s) await tell("po_approval", request.entityCode, user.id, nextApprovers(s.po), { number: s.number });
  return result;
}

export async function runPoAction(id: string, action: PoAction, note: string): Promise<Result> {
  const user = await requireUser();
  const parsed = z.object({ id: z.string().uuid(), action: z.enum(PO_ACTIONS), note: z.string().trim().max(500) }).safeParse({ id, action, note });
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const v = parsed.data;
  const org = await loadOrg();
  let sent: { number: string; po: PoLike; by: string } | null = null;
  const result = await run(() =>
    db.transaction(async (tx) => {
      const [po] = await tx.select().from(schema.purchaseOrder).where(eq(schema.purchaseOrder.id, v.id)).for("update");
      if (!po) throw new WorkflowError("PO tidak ditemukan.");
      const [request] = await tx.select().from(schema.purchaseRequest).where(eq(schema.purchaseRequest.id, po.requestId));
      const context = await poContext(tx, po, request!);
      const step = poStep(context, v.action, user.actor, org, v.note);
      if ("problem" in step) throw new WorkflowError(step.problem === "note_required" ? "Tulis alasannya." : "Anda tidak berwenang atas langkah ini.");
      if (v.action === "cancel") {
        const billed = await tx
          .select({ id: schema.paymentRequest.id })
          .from(schema.paymentRequest)
          .where(and(eq(schema.paymentRequest.purchaseOrderId, po.id), inArray(schema.paymentRequest.state, ["submitted", "under_review", "pending_approval", "frm_approval", "director_approval", "approved", "scheduled", "paid"])));
        if (billed.length) throw new WorkflowError("PO ini sudah ditagih.");
      }
      const patch = { state: step.to, note: v.action === "return" || v.action === "cancel" ? v.note : v.action === "resubmit" ? null : po.note, updatedAt: new Date() };
      await tx.update(schema.purchaseOrder).set(patch).where(eq(schema.purchaseOrder.id, po.id));
      await audit(tx, user.id, `po_${v.action}`, "purchase_order", po.id, { state: po.state }, patch);
      sent = { number: po.number, po: { ...context, state: step.to }, by: po.createdBy };
      return `${po.number} diperbarui.`;
    }),
  );
  const s = sent as { number: string; po: PoLike; by: string } | null;
  if (result.ok && s) {
    if (s.po.state === "approved") await tell("po_approved", s.po.entity, user.id, () => false, { number: s.number }, [s.by, s.po.requestedBy]);
    else if (s.po.state === "returned") await tell("po_returned", s.po.entity, user.id, () => false, { number: s.number, comment: v.note }, [s.by]);
    else if (s.po.state !== "cancelled") await tell("po_approval", s.po.entity, user.id, nextApprovers(s.po), { number: s.number });
  }
  return result;
}

const Receipt = z.object({ orderId: z.string().uuid(), receivedOn: day, amount: z.string().max(40), bastNumber: z.string().trim().min(1, "Isi nomor BAST.").max(100), note: z.string().trim().max(500) });

/** The internal BAST: the PM or PMO records what arrived (sheet FC05_SCM_Pengadaan step 8). */
export async function recordReceiptOfGoods(input: z.input<typeof Receipt>): Promise<Result> {
  const user = await requireUser();
  const parsed = Receipt.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const v = parsed.data;
  const org = await loadOrg();
  const [found] = await db
    .select({ entity: schema.purchaseOrder.entityCode, pm: schema.project.pmUserId })
    .from(schema.purchaseOrder)
    .innerJoin(schema.purchaseRequest, eq(schema.purchaseRequest.id, schema.purchaseOrder.requestId))
    .innerJoin(schema.project, eq(schema.project.id, schema.purchaseRequest.projectId))
    .where(eq(schema.purchaseOrder.id, v.orderId));
  if (!found || !canRequestPurchase(user.actor, found, org)) return { ok: false, message: "Penerimaan dicatat PM proyek atau PMO." };
  return run(async () => {
    const amount = amountOf(v.amount);
    return db.transaction(async (tx) => {
      const [po] = await tx.select().from(schema.purchaseOrder).where(eq(schema.purchaseOrder.id, v.orderId)).for("update");
      const earlier = await tx.select({ amount: schema.goodsReceipt.amount }).from(schema.goodsReceipt).where(eq(schema.goodsReceipt.orderId, v.orderId));
      const problem = goodsReceiptProblem({
        state: po!.state, amount, received: sum(earlier.map((r) => money(r.amount))), poAmount: money(po!.amount), receivedOn: v.receivedOn, poDate: po!.orderedOn,
        today: todayJakarta(), actorId: user.id, createdBy: po!.createdBy,
      });
      const message = { state: "PO belum disetujui.", own: "Penerima tidak boleh pembuat PO.", amount: "Isi nilai diterima lebih dari 0.", over: "Total penerimaan melebihi nilai PO.", date: "Tanggal terima harus antara tanggal PO dan hari ini." };
      if (problem) throw new WorkflowError(message[problem]);
      const values = { orderId: po!.id, receivedOn: v.receivedOn, amount: amount.toFixed(2), bastNumber: v.bastNumber, note: v.note || null, createdBy: user.id };
      const [row] = await tx.insert(schema.goodsReceipt).values(values).returning({ id: schema.goodsReceipt.id });
      await audit(tx, user.id, "receive", "goods_receipt", row!.id, null, values);
      return "Penerimaan dicatat.";
    });
  });
}
