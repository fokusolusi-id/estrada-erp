"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { can, money, validateLine, type ApprovalAction, type CoaAccount } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { openVersion } from "@/lib/rka";
import { applyTransition, loadOrg, WorkflowError } from "@/lib/workflow";

export type ActionResult = { ok: boolean; message: string; id?: string; errors?: Record<string, string> };

const AMOUNT = z.string().regex(/^\d+(\.\d{1,2})?$/, "Nominal tidak valid");

const LineInput = z.object({
  id: z.string().uuid().optional(),
  coaCode: z.string().min(1, "Pilih COA"),
  entityCode: z.string().min(1, "Pilih entitas"),
  ownerUnit: z.string().min(1, "Pilih unit pemilik anggaran"),
  item: z.string().trim().max(200).optional(),
  basis: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(1000).optional(),
  months: z.array(AMOUNT).length(12),
});
export type LineInputValue = z.input<typeof LineInput>;

const VALIDATION_MESSAGE: Record<string, string> = {
  months_length: "Harus 12 bulan",
  negative_amount: "Nominal tidak boleh negatif",
  coa_unknown: "COA tidak ada di COA Master",
  coa_inactive: "COA tidak aktif",
  entity_unknown: "Entitas tidak dikenal atau di luar akses Anda",
  basis_required: "Dasar perhitungan wajib diisi",
};

const RKA_PATHS = ["/rka", "/rka/queue", "/rka/division", "/rka/review", "/rka/lock"];
const revalidateRka = () => RKA_PATHS.forEach((p) => revalidatePath(p));

/** Create or update a line. Requestors create draft lines for their own unit; edits follow `line.edit`. */
export async function saveLine(input: LineInputValue): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = LineInput.safeParse(input);
  if (!parsed.success) {
    const errors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    return { ok: false, message: "Periksa isian baris.", errors };
  }
  const v = parsed.data;

  const version = await openVersion();
  if (!version) return { ok: false, message: "Belum ada siklus RKA yang dibuka." };

  const org = await loadOrg();
  const [existing] = v.id
    ? await db.select().from(schema.budgetLine).where(and(eq(schema.budgetLine.id, v.id), eq(schema.budgetLine.versionId, version.id)))
    : [];
  if (v.id && !existing) return { ok: false, message: "Baris tidak ditemukan." };

  const requestorUnit = existing?.requestorUnit ?? user.actor.orgUnit;
  const state = existing?.state ?? "draft";
  if (!existing && user.actor.role !== "requestor") return { ok: false, message: "Hanya Requestor yang dapat menambah baris." };
  const before = existing ? { requestorUnit, ownerUnit: existing.ownerUnit, entity: existing.entityCode, state } : null;
  const after = { requestorUnit, ownerUnit: v.ownerUnit, entity: v.entityCode, state };
  if ((before && !can(user.actor, "line.edit", before, org)) || !can(user.actor, "line.edit", after, org)) {
    return { ok: false, message: "Anda tidak berwenang mengubah baris ini." };
  }

  const [coaRows, entityRows, units] = await Promise.all([
    db.select().from(schema.coaAccount).where(eq(schema.coaAccount.code, v.coaCode)),
    db.select().from(schema.companyEntity).where(eq(schema.companyEntity.active, true)),
    db.select().from(schema.orgUnit),
  ]);
  if (!units.some((u) => u.code === v.ownerUnit)) return { ok: false, message: "Periksa isian baris.", errors: { ownerUnit: "Unit tidak dikenal" } };

  const coa = new Map<string, CoaAccount>(coaRows.map((c) => [c.code, { code: c.code, category: c.category, status: c.active ? "active" : "inactive" }]));
  const entities = new Set(entityRows.map((e) => e.code));
  const months = v.months.map((m) => money(m));
  const errors = validateLine(
    { id: v.id ?? "new", coaCode: v.coaCode, entity: v.entityCode, requestorUnit, ownerUnit: v.ownerUnit, months, ...(v.basis ? { basis: v.basis } : {}) },
    { coa, entities },
  );
  if (errors.length) {
    return { ok: false, message: "Periksa isian baris.", errors: Object.fromEntries(errors.map((e) => [e.field === "entity" ? "entityCode" : e.field, VALIDATION_MESSAGE[e.code] ?? e.code])) };
  }

  const values = {
    coaCode: v.coaCode,
    entityCode: v.entityCode,
    ownerUnit: v.ownerUnit,
    item: v.item || null,
    basis: v.basis || null,
    notes: v.notes || null,
    crossDivision: org.divisionOf(requestorUnit) !== org.divisionOf(v.ownerUnit),
  };

  const id = await db.transaction(async (tx) => {
    let lineId = existing?.id;
    if (lineId) {
      await tx.update(schema.budgetLine).set({ ...values, updatedAt: new Date() }).where(eq(schema.budgetLine.id, lineId));
      await tx.delete(schema.budgetLineAmount).where(eq(schema.budgetLineAmount.lineId, lineId));
    } else {
      const [row] = await tx
        .insert(schema.budgetLine)
        .values({ ...values, versionId: version.id, requestorUnit, createdBy: user.id })
        .returning({ id: schema.budgetLine.id });
      lineId = row!.id;
    }
    await tx.insert(schema.budgetLineAmount).values(v.months.map((amount, i) => ({ lineId: lineId!, month: i + 1, amount })));
    await tx.insert(schema.auditLog).values({
      actorUserId: user.id,
      action: existing ? "line.update" : "line.create",
      subjectType: "budget_line",
      subjectId: lineId,
      before: existing ?? null,
      after: { ...values, months: v.months },
    });
    return lineId;
  });

  revalidateRka();
  return { ok: true, message: "Baris tersimpan.", id };
}

/** Requestors delete their own draft lines; nothing else is ever deleted. */
export async function deleteLine(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const org = await loadOrg();
  const [line] = await db.select().from(schema.budgetLine).where(eq(schema.budgetLine.id, id));
  if (!line || line.state !== "draft") return { ok: false, message: "Hanya baris draft yang dapat dihapus." };
  const res = { requestorUnit: line.requestorUnit, ownerUnit: line.ownerUnit, entity: line.entityCode, state: line.state };
  if (user.actor.role !== "requestor" || !can(user.actor, "line.edit", res, org)) {
    return { ok: false, message: "Anda tidak berwenang menghapus baris ini." };
  }
  await db.transaction(async (tx) => {
    await tx.delete(schema.budgetLine).where(eq(schema.budgetLine.id, id));
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "line.delete", subjectType: "budget_line", subjectId: id, before: line });
  });
  revalidateRka();
  return { ok: true, message: "Baris dihapus." };
}

const ACTIONS = ["submit", "return", "consolidate", "approve", "clarify", "finalize", "lock"] as const satisfies readonly ApprovalAction[];
const MoveInput = z.object({
  ids: z.array(z.string().uuid()).min(1, "Pilih minimal satu baris"),
  action: z.enum(ACTIONS),
  comment: z.string().trim().max(2000).optional(),
});

/** Moves lines one approval step through `applyTransition`. */
export async function moveLines(input: z.input<typeof MoveInput>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = MoveInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Permintaan tidak valid." };
  const { ids, action, comment } = parsed.data;
  try {
    await applyTransition(user.actor, ids, action, comment || undefined);
  } catch (e) {
    if (e instanceof WorkflowError) return { ok: false, message: e.message };
    if (e instanceof Error && /requires a comment/.test(e.message)) return { ok: false, message: "Catatan wajib diisi." };
    if (e instanceof Error && /not allowed/.test(e.message)) return { ok: false, message: "Aksi ini tidak tersedia untuk status baris." };
    throw e;
  }
  revalidateRka();
  return { ok: true, message: `${ids.length} baris diproses.` };
}

/** Requestor sends saved draft lines to the Default Owner. */
export async function submitLines(ids: string[]): Promise<ActionResult> {
  return moveLines({ ids, action: "submit" });
}

/** Queue screens: one call per handoff, with the reviewer's comment when the step needs one. */
export async function actOnLines(ids: string[], action: ApprovalAction, comment: string | undefined): Promise<ActionResult> {
  return moveLines({ ids, action, ...(comment ? { comment } : {}) });
}
