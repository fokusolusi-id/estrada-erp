"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { can, duplicateOf, headcountBasis, headcountMonths, headcountProblems, money, validateLine, type ApprovalAction, type CoaAccount, type HeadcountField } from "@estrada/domain";
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
const DUPLICATE_MESSAGE = "COA ini sudah diusulkan untuk Entitas dan Pemilik yang sama. Ubah baris yang ada, atau pilih Entitas atau Pemilik lain.";

const RKA_PATHS = ["/rka", "/rka/queue", "/rka/division", "/rka/review", "/rka/lock"];
const revalidateRka = () => RKA_PATHS.forEach((p) => revalidatePath(p));

const issues = (error: z.ZodError) => Object.fromEntries(error.issues.map((i) => [String(i.path[0]), i.message]));

/** Create or update a line. Requestors create draft lines for their own unit; edits follow `line.edit`. */
export async function saveLine(input: LineInputValue): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = LineInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Periksa isian baris.", errors: issues(parsed.error) };
  if (parsed.data.id) {
    const [planned] = await db.select({ lineId: schema.headcountPlan.lineId }).from(schema.headcountPlan).where(eq(schema.headcountPlan.lineId, parsed.data.id));
    if (planned) return { ok: false, message: "Baris ini diatur dari Rencana headcount." };
  }
  return writeLine(user, parsed.data);
}

type HeadcountValues = { position: string; headCount: number; startMonth: number; costPerHead: string };

/** Shared by the editor and the headcount plan; a plan row is written with its line in one transaction. */
async function writeLine(user: Awaited<ReturnType<typeof requireUser>>, v: z.output<typeof LineInput>, plan?: HeadcountValues): Promise<ActionResult> {
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

  // One line per COA, entity and budget owner for a requesting unit; headcount positions share a salary COA and are left out.
  // Lines the import already doubled stay editable: the check runs when a line is new or moves to another slot.
  const moved = !existing || existing.coaCode !== v.coaCode || existing.entityCode !== v.entityCode || existing.ownerUnit !== v.ownerUnit;
  if (!plan && moved) {
    const same = await db
      .select({ id: schema.budgetLine.id, planned: schema.headcountPlan.lineId })
      .from(schema.budgetLine)
      .leftJoin(schema.headcountPlan, eq(schema.headcountPlan.lineId, schema.budgetLine.id))
      .where(
        and(
          eq(schema.budgetLine.versionId, version.id),
          eq(schema.budgetLine.requestorUnit, requestorUnit),
          eq(schema.budgetLine.coaCode, v.coaCode),
          eq(schema.budgetLine.entityCode, v.entityCode),
          eq(schema.budgetLine.ownerUnit, v.ownerUnit),
        ),
      );
    const key = { requestorUnit, coaCode: v.coaCode, entity: v.entityCode, ownerUnit: v.ownerUnit };
    if (duplicateOf({ ...key, ...(v.id ? { id: v.id } : {}) }, same.map((r) => ({ ...key, id: r.id, planned: !!r.planned })))) {
      return { ok: false, message: DUPLICATE_MESSAGE, errors: { coaCode: DUPLICATE_MESSAGE } };
    }
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
    if (plan) {
      await tx.insert(schema.headcountPlan).values({ lineId, ...plan }).onConflictDoUpdate({ target: schema.headcountPlan.lineId, set: plan });
    }
    await tx.insert(schema.auditLog).values({
      actorUserId: user.id,
      action: existing ? "line.update" : "line.create",
      subjectType: "budget_line",
      subjectId: lineId,
      before: existing ?? null,
      after: { ...values, months: v.months, ...(plan ? { headcount: plan } : {}) },
    });
    return lineId;
  });

  revalidateRka();
  return { ok: true, message: "Baris tersimpan.", id };
}

const HeadcountInput = z.object({
  id: z.string().uuid().optional(),
  position: z.string().trim().max(200),
  coaCode: z.string().min(1, "Pilih COA"),
  entityCode: z.string().min(1, "Pilih entitas"),
  count: z.number(),
  startMonth: z.number(),
  costPerHead: AMOUNT,
});
export type HeadcountInputValue = z.input<typeof HeadcountInput>;

const HEADCOUNT_MESSAGE: Record<HeadcountField, string> = {
  position: "Jabatan wajib diisi",
  count: "Jumlah 1–999 orang",
  startMonth: "Pilih bulan mulai",
  costPerHead: "Biaya per orang harus lebih dari 0",
};

/**
 * Save a position in the requestor's headcount plan. The plan computes the line's months and basis;
 * the line goes to the COA's default owner (Beban rekrutmen: HCM) like any other draft.
 */
export async function saveHeadcount(input: HeadcountInputValue): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = HeadcountInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Periksa isian posisi.", errors: issues(parsed.error) };
  const h = parsed.data;
  const row = { position: h.position, count: h.count, startMonth: h.startMonth, costPerHead: money(h.costPerHead) };
  const problems = Object.entries(headcountProblems(row)) as [HeadcountField, string][];
  if (problems.length) return { ok: false, message: "Periksa isian posisi.", errors: Object.fromEntries(problems.map(([f]) => [f, HEADCOUNT_MESSAGE[f]])) };

  if (h.id) {
    const [planned] = await db.select({ lineId: schema.headcountPlan.lineId }).from(schema.headcountPlan).where(eq(schema.headcountPlan.lineId, h.id));
    if (!planned) return { ok: false, message: "Posisi tidak ditemukan." };
  }
  const [coa] = await db.select({ defaultOwnerUnit: schema.coaAccount.defaultOwnerUnit }).from(schema.coaAccount).where(eq(schema.coaAccount.code, h.coaCode));
  if (!coa) return { ok: false, message: "Periksa isian posisi.", errors: { coaCode: "COA tidak ada di COA Master" } };

  const res = await writeLine(
    user,
    {
      ...(h.id ? { id: h.id } : {}),
      coaCode: h.coaCode,
      entityCode: h.entityCode,
      ownerUnit: coa.defaultOwnerUnit ?? user.actor.orgUnit,
      item: h.position,
      basis: headcountBasis(row),
      months: headcountMonths(row).map((m) => m.toFixed(2)),
    },
    { position: h.position, headCount: h.count, startMonth: h.startMonth, costPerHead: row.costPerHead.toFixed(2) },
  );
  return res.ok ? { ...res, message: "Posisi tersimpan." } : res;
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
