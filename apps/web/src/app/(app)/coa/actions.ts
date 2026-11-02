"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { can, coaParentProblem, remapProblem, type CoaParentProblem, type RemapProblem } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

export type CoaState = { ok: boolean; message: string; errors?: Record<string, string[]> };

/** COA Master belongs to Finance alone (CARA PENGISIAN point 6, confirmed by the client). */
async function requireCoaOwner() {
  const user = await requireUser();
  return can(user.actor, "coa.manage", null, await loadOrg()) ? user : null;
}

const CATEGORIES = ["Revenue", "COGS", "OPEX", "OTHERS", "CAPEX"] as const;
const CoaSchema = z.object({
  mode: z.enum(["create", "update"]),
  code: z.string().trim().regex(/^[0-9A-Za-z][0-9A-Za-z-]{1,19}$/, "Kode 2–20 karakter: angka, huruf, tanda hubung"),
  name: z.string().trim().min(3, "Nama wajib diisi"),
  category: z.enum(CATEGORIES),
  defaultOwnerUnit: z.string().optional(),
  parentCode: z.string().optional(),
  active: z.string().optional(),
  guidance: z.string().trim().max(2000).optional(),
});

const PARENT_MESSAGE: Record<CoaParentProblem, string> = {
  self: "Kode tidak bisa menjadi induknya sendiri.",
  missing: "Kode induk tidak ditemukan.",
  category_mismatch: "Induk harus berkategori sama, supaya subtotal tetap di baris P&L yang sama.",
  cycle: "Induk ini berada di bawah kode tersebut.",
};

const usedBy = async (code: string) =>
  (await db.select({ n: count() }).from(schema.budgetLine).where(eq(schema.budgetLine.coaCode, code)))[0]?.n ?? 0;

export async function saveCoa(_prev: CoaState, form: FormData): Promise<CoaState> {
  const finance = await requireCoaOwner();
  if (!finance) return { ok: false, message: "Hanya Finance yang dapat mengubah COA Master." };
  const parsed = CoaSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Periksa isian.", errors: z.flattenError(parsed.error).fieldErrors };
  const v = parsed.data;

  const [existing] = await db.select().from(schema.coaAccount).where(eq(schema.coaAccount.code, v.code));
  if (v.mode === "create" && existing) return { ok: false, message: `Kode ${v.code} sudah ada.` };
  if (v.mode === "update" && !existing) return { ok: false, message: `Kode ${v.code} tidak ditemukan.` };
  if (existing && existing.category !== v.category) {
    const n = await usedBy(v.code);
    if (n) return { ok: false, message: `Kategori tidak bisa diubah: kode ini dipakai ${n} baris RKA.` };
  }

  const parentCode = v.parentCode || null;
  const tree = await db.select({ code: schema.coaAccount.code, category: schema.coaAccount.category, parentCode: schema.coaAccount.parentCode }).from(schema.coaAccount);
  const parentProblem = coaParentProblem(v.code, parentCode, tree, v.category);
  if (parentProblem) return { ok: false, message: "Periksa isian.", errors: { parentCode: [PARENT_MESSAGE[parentProblem]] } };
  if (existing && existing.category !== v.category && tree.some((a) => a.parentCode === v.code)) {
    return { ok: false, message: "Kategori tidak bisa diubah selama kode ini masih punya anak." };
  }

  const values = {
    name: v.name,
    category: v.category,
    center: v.category === "Revenue" ? ("revenue" as const) : ("cost" as const),
    defaultOwnerUnit: v.defaultOwnerUnit || null,
    parentCode,
    active: v.active === "on",
    guidance: v.guidance || null,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    if (existing) await tx.update(schema.coaAccount).set(values).where(eq(schema.coaAccount.code, v.code));
    else await tx.insert(schema.coaAccount).values({ code: v.code, ...values });
    await tx.insert(schema.auditLog).values({
      actorUserId: finance.id,
      action: existing ? "coa.update" : "coa.create",
      subjectType: "coa_account",
      subjectId: v.code,
      before: existing ?? null,
      after: values,
    });
  });
  revalidatePath("/coa");
  return { ok: true, message: existing ? `COA ${v.code} diperbarui.` : `COA ${v.code} ditambahkan.` };
}

export async function confirmCoa(code: string): Promise<CoaState> {
  const finance = await requireCoaOwner();
  if (!finance) return { ok: false, message: "Hanya Finance yang dapat mengubah COA Master." };
  const [acc] = await db.select().from(schema.coaAccount).where(eq(schema.coaAccount.code, code));
  if (!acc?.provisional) return { ok: false, message: "Kode ini bukan kode sementara." };
  await db.transaction(async (tx) => {
    await tx.update(schema.coaAccount).set({ provisional: false, guidance: null, updatedAt: new Date() }).where(eq(schema.coaAccount.code, code));
    await tx.insert(schema.auditLog).values({ actorUserId: finance.id, action: "coa.confirm", subjectType: "coa_account", subjectId: code });
  });
  revalidatePath("/coa");
  return { ok: true, message: `${code} dikonfirmasi sebagai akun COA Master.` };
}

const REMAP_MESSAGE: Record<RemapProblem, string> = {
  source_not_provisional: "Hanya kode sementara yang bisa dipindahkan.",
  target_missing: "Kode tujuan tidak ditemukan.",
  same_code: "Kode tujuan sama dengan kode asal.",
  target_inactive: "Kode tujuan tidak aktif.",
  target_provisional: "Kode tujuan juga masih sementara.",
  category_mismatch: "Kategori kode tujuan berbeda; total kategori akan berubah.",
  locked_lines: "Ada baris di versi yang sudah dikunci; versi terkunci tidak diubah.",
};

/** Moves every line off a provisional code onto an existing one, then removes the provisional code. */
export async function remapCoa(source: string, target: string): Promise<CoaState> {
  const finance = await requireCoaOwner();
  if (!finance) return { ok: false, message: "Hanya Finance yang dapat mengubah COA Master." };
  const [src] = await db.select().from(schema.coaAccount).where(eq(schema.coaAccount.code, source));
  if (!src) return { ok: false, message: "Kode asal tidak ditemukan." };
  const [dst] = await db.select().from(schema.coaAccount).where(eq(schema.coaAccount.code, target));
  const [locked] = await db
    .select({ n: count() })
    .from(schema.budgetLine)
    .innerJoin(schema.budgetVersion, eq(schema.budgetVersion.id, schema.budgetLine.versionId))
    .where(and(eq(schema.budgetLine.coaCode, source), eq(schema.budgetVersion.status, "locked")));
  const problem = remapProblem(src, dst, locked?.n ?? 0);
  if (problem) return { ok: false, message: REMAP_MESSAGE[problem] };

  const moved = await db.transaction(async (tx) => {
    const rows = await tx
      .update(schema.budgetLine)
      .set({ coaCode: target, updatedAt: new Date() })
      .where(eq(schema.budgetLine.coaCode, source))
      .returning({ id: schema.budgetLine.id });
    await tx.delete(schema.coaAccount).where(eq(schema.coaAccount.code, source));
    await tx.insert(schema.auditLog).values({
      actorUserId: finance.id,
      action: "coa.remap",
      subjectType: "coa_account",
      subjectId: source,
      before: src,
      after: { target, lines: rows.length },
    });
    return rows.length;
  });
  revalidatePath("/coa");
  return { ok: true, message: `${moved} baris dipindahkan dari ${source} ke ${target}; kode ${source} dihapus.` };
}
