"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { can } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

export type MasterState = { ok: boolean; message: string };

async function requireOrgAdmin() {
  const user = await requireUser();
  return can(user.actor, "org.manage", null, await loadOrg()) ? user : null;
}

const CODE = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,20}$/, "Kode 2–20 karakter: huruf, angka, - atau _");
const UnitSchema = z.object({
  code: CODE,
  name: z.string().trim().min(2, "Nama wajib diisi"),
  type: z.enum(["company", "division", "department", "unit"]),
  parentCode: z.string().optional(),
  isNew: z.string().optional(),
});

export async function saveUnit(_prev: MasterState, form: FormData): Promise<MasterState> {
  const admin = await requireOrgAdmin();
  if (!admin) return { ok: false, message: "Hanya Admin yang dapat mengelola master." };
  const parsed = UnitSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const { code, name, type, isNew } = parsed.data;
  const parentCode = parsed.data.parentCode || null;
  if (parentCode === code) return { ok: false, message: "Unit tidak boleh menjadi induk dirinya sendiri." };

  const [existing] = await db.select().from(schema.orgUnit).where(eq(schema.orgUnit.code, code));
  if (isNew && existing) return { ok: false, message: "Kode unit sudah ada." };
  if (!isNew && !existing) return { ok: false, message: "Unit tidak ditemukan." };
  if (parentCode) {
    const [p] = await db.select().from(schema.orgUnit).where(eq(schema.orgUnit.code, parentCode));
    if (!p) return { ok: false, message: "Unit induk tidak dikenal." };
  }

  await db.transaction(async (tx) => {
    if (existing) await tx.update(schema.orgUnit).set({ name, type, parentCode }).where(eq(schema.orgUnit.code, code));
    else await tx.insert(schema.orgUnit).values({ code, name, type, parentCode });
    await tx.insert(schema.auditLog).values({
      actorUserId: admin.id,
      action: existing ? "unit.update" : "unit.create",
      subjectType: "org_unit",
      subjectId: code,
      ...(existing ? { before: { name: existing.name, type: existing.type, parentCode: existing.parentCode } } : {}),
      after: { name, type, parentCode },
    });
  });
  revalidatePath("/admin", "layout");
  return { ok: true, message: existing ? "Unit disimpan." : "Unit ditambahkan." };
}

const EntitySchema = z.object({
  code: CODE,
  name: z.string().trim().min(2, "Nama wajib diisi"),
  costType: z.enum(["direct", "indirect"]),
  active: z.string().optional(),
  isNew: z.string().optional(),
});

export async function saveEntity(_prev: MasterState, form: FormData): Promise<MasterState> {
  const admin = await requireOrgAdmin();
  if (!admin) return { ok: false, message: "Hanya Admin yang dapat mengelola master." };
  const parsed = EntitySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Periksa isian." };
  const { code, name, costType, isNew } = parsed.data;
  const active = parsed.data.active === "on" || !!isNew;

  const [existing] = await db.select().from(schema.companyEntity).where(eq(schema.companyEntity.code, code));
  if (isNew && existing) return { ok: false, message: "Kode entitas sudah ada." };
  if (!isNew && !existing) return { ok: false, message: "Entitas tidak ditemukan." };

  await db.transaction(async (tx) => {
    if (existing) await tx.update(schema.companyEntity).set({ name, costType, active }).where(eq(schema.companyEntity.code, code));
    else await tx.insert(schema.companyEntity).values({ code, name, costType, active });
    await tx.insert(schema.auditLog).values({
      actorUserId: admin.id,
      action: existing ? "entity.update" : "entity.create",
      subjectType: "company_entity",
      subjectId: code,
      ...(existing ? { before: { name: existing.name, costType: existing.costType, active: existing.active } } : {}),
      after: { name, costType, active },
    });
  });
  revalidatePath("/admin", "layout");
  return { ok: true, message: existing ? "Entitas disimpan." : "Entitas ditambahkan." };
}
