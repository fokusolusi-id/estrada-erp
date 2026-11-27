"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import {
  BG_TYPES, FACILITY_TYPES, ZERO, can, canConfirmRelease, documentProblem, drawingOwed, drawingProblem, facilityPaymentProblem, facilityPosition,
  issueProblem, money, parseIdr, releaseProblem, type DrawingProblem, type FacilityPaymentProblem, type IssueProblem, type Money, type Permission,
} from "@estrada/domain";
import { cashManagers, coversEntity, notifyObligo } from "@/lib/obligo";
import { assertOpenPeriod } from "@/lib/period";
import { todayJakarta } from "@/lib/payment";
import { requireUser, type CurrentUser } from "@/lib/session";
import { putFile } from "@/lib/storage";
import { loadOrg, WorkflowError } from "@/lib/workflow";

type Result = { ok: boolean; message: string };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const REFUSAL = {
  "obligo.manage": "Fasilitas bank dikelola Cash Management.",
  "obligo.request": "Permintaan obligo diajukan PMO atau Finance.",
} satisfies Partial<Record<Permission, string>>;
const REQUEST: Record<DrawingProblem, string> = {
  closed: "Fasilitas ini tidak aktif atau sudah expired.",
  kind: "Fasilitas ini tidak menerbitkan jenis tersebut.",
  amount: "Isi nilai lebih dari 0.",
  plafon: "Melebihi kelonggaran plafon fasilitas.",
  bg_type: "Pilih tipe Bank Garansi.",
  project: "Bank Garansi wajib terkait proyek.",
  underlying: "Isi underlying (nomor kontrak atau KL).",
  document: "Lampirkan dokumen underlying.",
};
const ISSUE: Record<IssueProblem, string> = {
  state: "Permintaan ini sudah diputuskan.",
  own_request: "Penyetuju tidak boleh orang yang mengajukan.",
  reference: "Isi nomor BG atau akad dari bank.",
  issued_on: "Tanggal terbit tidak boleh setelah hari ini.",
  due_on: "Tanggal jatuh tempo harus sesudah tanggal terbit.",
  plafon: "Melebihi kelonggaran plafon fasilitas.",
};
const PAYMENT: Record<FacilityPaymentProblem, string> = {
  amount: "Isi pokok atau bunga lebih dari 0.",
  drawing: "Pilih penarikan yang dibayar pokoknya.",
  over: "Pokok melebihi sisa penarikan.",
  date: "Tanggal bayar tidak boleh setelah hari ini.",
};

const Id = z.string().uuid("Data tidak ditemukan.");
const refresh = () => {
  revalidatePath("/obligo");
  revalidatePath("/cash/mingguan");
};
async function allowed(permission: keyof typeof REFUSAL): Promise<CurrentUser | Result> {
  const user = await requireUser();
  return can(user.actor, permission, null, await loadOrg()) ? user : { ok: false, message: REFUSAL[permission] };
}
const amountOf = (s: string): Money | null => {
  try {
    return s.trim() ? parseIdr(s) : ZERO;
  } catch {
    return null;
  }
};
const audit = (tx: Tx, userId: string, action: string, subjectType: string, subjectId: string, before: unknown, after: unknown) =>
  tx.insert(schema.auditLog).values({ actorUserId: userId, action, subjectType, subjectId, before, after });
async function run(work: () => Promise<string>): Promise<Result> {
  try {
    const message = await work();
    refresh();
    return { ok: true, message };
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    throw e;
  }
}

/** The facility held for the rest of the transaction, so two drawings cannot together pass its plafon. */
async function lockedPosition(tx: Tx, facilityId: string) {
  const [facility] = await tx.select().from(schema.bankFacility).where(eq(schema.bankFacility.id, facilityId)).for("update");
  if (!facility) throw new WorkflowError("Fasilitas tidak ditemukan.");
  const drawings = await tx.select().from(schema.facilityDrawing).where(eq(schema.facilityDrawing.facilityId, facilityId));
  const payments = await tx.select().from(schema.facilityPayment).where(and(eq(schema.facilityPayment.facilityId, facilityId), isNull(schema.facilityPayment.reversedAt)));
  const amounts = drawings.map((d) => ({ id: d.id, kind: d.kind, state: d.state, amount: money(d.amount) }));
  const paid = payments.map((p) => ({ drawingId: p.drawingId, principal: money(p.principal) }));
  return { facility, drawings, amounts, paid, ...facilityPosition(money(facility.plafon), amounts, paid) };
}

const Facility = z.object({
  id: z.string().max(36),
  bankName: z.string().trim().min(2, "Isi nama bank.").max(60),
  name: z.string().trim().min(1, "Isi nama fasilitas.").max(60),
  type: z.enum(FACILITY_TYPES),
  entityCode: z.string().max(20),
  plafon: z.string().max(40),
  expiresOn: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal expired tidak valid.")]),
  contractNo: z.string().trim().max(100),
  interestDay: z.union([z.literal(""), z.string().regex(/^([1-9]|[12]\d|3[01])$/, "Tanggal bunga 1 sampai 31.")]),
  escrowAccount: z.string().trim().max(60),
  active: z.boolean(),
});
export type FacilityInput = z.input<typeof Facility>;

export async function saveFacility(input: FacilityInput): Promise<Result> {
  const user = await allowed("obligo.manage");
  if ("ok" in user) return user;
  const parsed = Facility.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const v = parsed.data;
  const plafon = amountOf(v.plafon);
  if (!plafon?.gt(0)) return { ok: false, message: "Isi plafon lebih dari 0." };
  if (v.entityCode && !coversEntity(user.actor, v.entityCode)) return { ok: false, message: "Entitas tidak dikenal." };
  return run(() =>
    db.transaction(async (tx) => {
      const values = {
        bankName: v.bankName, name: v.name, type: v.type, entityCode: v.entityCode || null, plafon: plafon.toFixed(2), expiresOn: v.expiresOn || null,
        contractNo: v.contractNo || null, interestDay: v.interestDay ? Number(v.interestDay) : null, escrowAccount: v.escrowAccount || null, active: v.active,
      };
      const same = await tx.select().from(schema.bankFacility).where(and(eq(schema.bankFacility.bankName, v.bankName), eq(schema.bankFacility.name, v.name)));
      if (same.some((f) => f.id !== v.id && f.entityCode === values.entityCode)) throw new WorkflowError("Fasilitas dengan bank, nama dan entitas ini sudah ada.");
      if (v.id) {
        const held = await lockedPosition(tx, v.id);
        if (plafon.lt(held.outstanding)) throw new WorkflowError("Plafon tidak boleh di bawah outstanding.");
        await tx.update(schema.bankFacility).set({ ...values, updatedAt: new Date() }).where(eq(schema.bankFacility.id, v.id));
        await audit(tx, user.id, "loan.facility", "bank_facility", v.id, held.facility, values);
      } else {
        const [row] = await tx.insert(schema.bankFacility).values(values).returning({ id: schema.bankFacility.id });
        await audit(tx, user.id, "loan.facility", "bank_facility", row!.id, null, values);
      }
      return "Fasilitas disimpan.";
    }),
  );
}

const Drawing = z.object({
  facilityId: Id,
  entityCode: z.string().max(20),
  kind: z.enum(["loan", "bg"]),
  bgType: z.union([z.literal(""), z.enum(BG_TYPES)]),
  projectId: z.union([z.literal(""), Id]),
  amount: z.string().max(40),
  underlying: z.string().trim().max(200),
});

/** PM or Finance asks for a guarantee or a drawdown, with its underlying document. */
export async function requestDrawing(form: FormData): Promise<Result> {
  const user = await allowed("obligo.request");
  if ("ok" in user) return user;
  const parsed = Drawing.safeParse(Object.fromEntries(Object.keys(Drawing.shape).map((k) => [k, String(form.get(k) ?? "")])));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const v = parsed.data;
  const amount = amountOf(v.amount);
  if (!amount) return { ok: false, message: "Nilai tidak terbaca." };
  const file = form.get("document");
  const hasDocument = file instanceof File && file.size > 0;
  if (hasDocument) {
    const problem = documentProblem(file);
    if (problem) return { ok: false, message: problem };
  }
  let notice: { entity: string; facility: string } | null = null;
  const result = await run(() =>
    db.transaction(async (tx) => {
      const held = await lockedPosition(tx, v.facilityId);
      const f = held.facility;
      const [deal] = v.projectId
        ? await tx.select({ entity: schema.pipelineDeal.entityCode }).from(schema.project).innerJoin(schema.pipelineDeal, eq(schema.pipelineDeal.id, schema.project.dealId)).where(eq(schema.project.id, v.projectId))
        : [];
      if (v.projectId && !deal) throw new WorkflowError("Proyek tidak ditemukan.");
      const entity = f.entityCode ?? deal?.entity ?? v.entityCode;
      if (!entity || !coversEntity(user.actor, entity)) throw new WorkflowError("Pilih entitas.");
      if (deal && deal.entity !== entity) throw new WorkflowError("Proyek harus milik entitas yang sama dengan fasilitas.");
      const problem = drawingProblem({
        facility: f, kind: v.kind, bgType: v.bgType || null, amount, available: held.available, projectId: v.projectId || null,
        underlying: v.underlying, hasDocument, today: todayJakarta(),
      });
      if (problem) throw new WorkflowError(REQUEST[problem]);
      const upload = file as File;
      const path = `obligo/${randomUUID()}-${upload.name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "dokumen"}`;
      await putFile(path, new Uint8Array(await upload.arrayBuffer()), upload.type);
      const values = {
        facilityId: f.id, entityCode: entity, kind: v.kind, bgType: v.kind === "bg" ? v.bgType || null : null, projectId: v.projectId || null,
        underlying: v.underlying, documentName: upload.name.slice(0, 200), documentPath: path, documentType: upload.type, amount: amount.toFixed(2), requestedBy: user.id,
      };
      const [row] = await tx.insert(schema.facilityDrawing).values(values).returning({ id: schema.facilityDrawing.id });
      await audit(tx, user.id, "loan.drawing_request", "facility_drawing", row!.id, null, values);
      notice = { entity, facility: `${f.bankName} ${f.name}` };
      return "Permintaan dikirim ke Cash Management.";
    }),
  );
  const sent = notice as { entity: string; facility: string } | null;
  if (result.ok && sent) await notifyObligo("obligo_requested", await cashManagers(sent.entity), sent);
  return result;
}

async function drawingFor(tx: Tx, user: CurrentUser, id: string) {
  const [d] = await tx.select().from(schema.facilityDrawing).where(eq(schema.facilityDrawing.id, id)).for("update");
  if (!d || !coversEntity(user.actor, d.entityCode)) throw new WorkflowError("Permintaan tidak ditemukan.");
  return d;
}

const Issue = z.object({ id: Id, reference: z.string().max(100), issuedOn: z.string().max(10), dueOn: z.string().max(10) });

/** Cash Management checks the plafon again and records what the bank issued. */
export async function issueDrawing(input: z.input<typeof Issue>): Promise<Result> {
  const user = await allowed("obligo.manage");
  if ("ok" in user) return user;
  const parsed = Issue.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Periksa isian." };
  const v = parsed.data;
  let notice: { to: string; entity: string; facility: string } | null = null;
  const result = await run(() =>
    db.transaction(async (tx) => {
      const found = await drawingFor(tx, user, v.id);
      const held = await lockedPosition(tx, found.facilityId);
      const problem = issueProblem({
        state: found.state, requestedBy: found.requestedBy ?? "", actorId: user.id, reference: v.reference, issuedOn: v.issuedOn, dueOn: v.dueOn,
        today: todayJakarta(), amount: money(found.amount), available: held.available,
      });
      if (problem) throw new WorkflowError(ISSUE[problem]);
      // A drawdown is cash in on that date; a guarantee moves none.
      const warning = found.kind === "loan" ? await assertOpenPeriod(tx, found.entityCode, v.issuedOn) : null;
      const patch = { state: "issued" as const, reference: v.reference.trim(), issuedOn: v.issuedOn, dueOn: v.dueOn, decidedBy: user.id, updatedAt: new Date() };
      await tx.update(schema.facilityDrawing).set(patch).where(eq(schema.facilityDrawing.id, found.id));
      await audit(tx, user.id, "loan.drawing_issue", "facility_drawing", found.id, { state: found.state }, patch);
      if (found.requestedBy) notice = { to: found.requestedBy, entity: found.entityCode, facility: `${held.facility.bankName} ${held.facility.name}` };
      return warning ? `Diterbitkan. ${warning}` : "Diterbitkan.";
    }),
  );
  const sent = notice as { to: string; entity: string; facility: string } | null;
  if (result.ok && sent) await notifyObligo("obligo_issued", [sent.to], { entity: sent.entity, facility: sent.facility });
  return result;
}

export async function rejectDrawing(id: string, reason: string): Promise<Result> {
  const user = await allowed("obligo.manage");
  if ("ok" in user) return user;
  const parsed = z.object({ id: Id, reason: z.string().trim().min(5).max(500) }).safeParse({ id, reason });
  if (!parsed.success) return { ok: false, message: "Tulis alasan penolakan." };
  let notice: { to: string; entity: string } | null = null;
  const result = await run(() =>
    db.transaction(async (tx) => {
      const found = await drawingFor(tx, user, parsed.data.id);
      if (found.state !== "requested") throw new WorkflowError(ISSUE.state);
      const patch = { state: "rejected" as const, note: parsed.data.reason, decidedBy: user.id, updatedAt: new Date() };
      await tx.update(schema.facilityDrawing).set(patch).where(eq(schema.facilityDrawing.id, found.id));
      await audit(tx, user.id, "loan.drawing_reject", "facility_drawing", found.id, { state: found.state }, patch);
      if (found.requestedBy) notice = { to: found.requestedBy, entity: found.entityCode };
      return "Permintaan ditolak.";
    }),
  );
  const sent = notice as { to: string; entity: string } | null;
  if (result.ok && sent) await notifyObligo("obligo_rejected", [sent.to], { entity: sent.entity, comment: parsed.data.reason });
  return result;
}

/** The project's PM confirms the contract has ended (BR-OBG-003). */
export async function confirmRelease(id: string): Promise<Result> {
  const user = await requireUser();
  const org = await loadOrg();
  if (!Id.safeParse(id).success) return { ok: false, message: "Data tidak ditemukan." };
  let notice: string | null = null;
  const result = await run(() =>
    db.transaction(async (tx) => {
      const found = await drawingFor(tx, user, id);
      const [project] = found.projectId ? await tx.select({ pm: schema.project.pmUserId }).from(schema.project).where(eq(schema.project.id, found.projectId)) : [];
      if (!canConfirmRelease(user.actor, project?.pm ?? null, org)) throw new WorkflowError("Konfirmasi dilakukan PM proyek (Head PMO bila proyek belum punya PM).");
      if (found.kind !== "bg" || found.state !== "issued") throw new WorkflowError("Hanya Bank Garansi aktif yang bisa dikonfirmasi.");
      if (found.releaseConfirmedAt) throw new WorkflowError("Sudah dikonfirmasi.");
      const patch = { releaseConfirmedBy: user.id, releaseConfirmedAt: new Date(), updatedAt: new Date() };
      await tx.update(schema.facilityDrawing).set(patch).where(eq(schema.facilityDrawing.id, found.id));
      await audit(tx, user.id, "loan.release_confirm", "facility_drawing", found.id, null, patch);
      notice = found.entityCode;
      return "Konfirmasi tercatat. Cash Management dapat melepas BG.";
    }),
  );
  const entity = notice as string | null;
  if (result.ok && entity) await notifyObligo("obligo_release_confirmed", await cashManagers(entity), { entity });
  return result;
}

export async function releaseGuarantee(id: string): Promise<Result> {
  const user = await allowed("obligo.manage");
  if ("ok" in user) return user;
  if (!Id.safeParse(id).success) return { ok: false, message: "Data tidak ditemukan." };
  return run(() =>
    db.transaction(async (tx) => {
      const found = await drawingFor(tx, user, id);
      const problem = releaseProblem({ kind: found.kind, state: found.state, confirmed: !!found.releaseConfirmedAt });
      if (problem) throw new WorkflowError(problem === "unconfirmed" ? "Menunggu konfirmasi PM bahwa kontrak selesai." : "Hanya Bank Garansi aktif yang bisa dilepas.");
      const patch = { state: "released" as const, releasedOn: todayJakarta(), updatedAt: new Date() };
      await tx.update(schema.facilityDrawing).set(patch).where(eq(schema.facilityDrawing.id, found.id));
      await audit(tx, user.id, "loan.release", "facility_drawing", found.id, { state: found.state }, patch);
      return "Bank Garansi dilepas.";
    }),
  );
}

const Payment = z.object({
  facilityId: Id,
  drawingId: z.union([z.literal(""), Id]),
  entityCode: z.string().max(20),
  paidOn: z.string().max(10),
  principal: z.string().max(40),
  interest: z.string().max(40),
  reference: z.string().trim().min(1, "Isi referensi mutasi bank.").max(100),
});
export type FacilityPaymentInput = z.input<typeof Payment>;

export async function recordFacilityPayment(input: FacilityPaymentInput): Promise<Result> {
  const user = await allowed("obligo.manage");
  if ("ok" in user) return user;
  const parsed = Payment.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const v = parsed.data;
  const [principal, interest] = [amountOf(v.principal), amountOf(v.interest)];
  if (!principal || !interest) return { ok: false, message: "Nominal tidak terbaca." };
  return run(() =>
    db.transaction(async (tx) => {
      const held = await lockedPosition(tx, v.facilityId);
      const drawing = v.drawingId ? held.drawings.find((d) => d.id === v.drawingId && d.kind === "loan" && d.state === "issued") : undefined;
      if (v.drawingId && !drawing) throw new WorkflowError("Penarikan tidak ditemukan.");
      const entity = drawing?.entityCode ?? held.facility.entityCode ?? v.entityCode;
      if (!entity || !coversEntity(user.actor, entity)) throw new WorkflowError("Pilih entitas.");
      const owed = drawing ? drawingOwed({ id: drawing.id, kind: drawing.kind, state: drawing.state, amount: money(drawing.amount) }, held.paid) : null;
      const problem = facilityPaymentProblem({ principal, interest, owed, paidOn: v.paidOn, today: todayJakarta() });
      if (problem) throw new WorkflowError(PAYMENT[problem]);
      const warning = await assertOpenPeriod(tx, entity, v.paidOn);
      const values = {
        facilityId: held.facility.id, drawingId: drawing?.id ?? null, entityCode: entity, paidOn: v.paidOn, principal: principal.toFixed(2),
        interest: interest.toFixed(2), reference: v.reference, createdBy: user.id,
      };
      const [row] = await tx.insert(schema.facilityPayment).values(values).returning({ id: schema.facilityPayment.id });
      await audit(tx, user.id, "loan.payment", "facility_payment", row!.id, null, values);
      return warning ? `Pembayaran dicatat. ${warning}` : "Pembayaran dicatat.";
    }),
  );
}

export async function reverseFacilityPayment(id: string, reason: string): Promise<Result> {
  const user = await allowed("obligo.manage");
  if ("ok" in user) return user;
  const parsed = z.object({ id: Id, reason: z.string().trim().min(5).max(500) }).safeParse({ id, reason });
  if (!parsed.success) return { ok: false, message: "Tulis alasan pembatalan." };
  return run(() =>
    db.transaction(async (tx) => {
      const [found] = await tx.select().from(schema.facilityPayment).where(eq(schema.facilityPayment.id, parsed.data.id)).for("update");
      if (!found || !coversEntity(user.actor, found.entityCode)) throw new WorkflowError("Pembayaran tidak ditemukan.");
      if (found.reversedAt) throw new WorkflowError("Pembayaran ini sudah dibatalkan.");
      await assertOpenPeriod(tx, found.entityCode, found.paidOn);
      const patch = { reversedAt: new Date(), reversedBy: user.id, reversalReason: parsed.data.reason };
      await tx.update(schema.facilityPayment).set(patch).where(eq(schema.facilityPayment.id, found.id));
      await audit(tx, user.id, "loan.payment_reverse", "facility_payment", found.id, found, patch);
      return "Pembayaran dibatalkan.";
    }),
  );
}
