"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { ROLES, can } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { entityList } from "@/lib/entity-scope";
import { loadOrg } from "@/lib/workflow";

export type PositionState = { ok: boolean; message: string; errors?: Record<string, string[]> };

async function requireOrgAdmin() {
  const user = await requireUser();
  return can(user.actor, "org.manage", null, await loadOrg()) ? user : null;
}

const CreateSchema = z.object({
  orgUnit: z.string().min(1, "Pilih unit"),
  title: z.string().trim().min(2, "Jabatan wajib diisi"),
  role: z.enum(ROLES),
  actingUserId: z.string().optional(),
});

/** Creates a position, vacant unless a pjs is named. Vacant heads are filled by a pjs, never by escalation. */
export async function createPosition(_prev: PositionState, form: FormData): Promise<PositionState> {
  const admin = await requireOrgAdmin();
  if (!admin) return { ok: false, message: "Hanya Admin yang dapat mengelola posisi." };

  const parsed = CreateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Periksa isian.", errors: z.flattenError(parsed.error).fieldErrors };
  const input = parsed.data;
  const entities = entityList(form);
  const actingUserId = input.actingUserId || null;

  const [unit] = await db.select().from(schema.orgUnit).where(eq(schema.orgUnit.code, input.orgUnit));
  if (!unit) return { ok: false, message: "Unit tidak dikenal." };
  if (actingUserId) {
    const [u] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, actingUserId));
    if (!u) return { ok: false, message: "Pengguna pjs tidak ditemukan." };
  }

  await db.transaction(async (tx) => {
    const [pos] = await tx
      .insert(schema.position)
      .values({ orgUnitCode: input.orgUnit, title: input.title, role: input.role, actingUserId })
      .returning({ id: schema.position.id });
    if (entities.length) {
      await tx.insert(schema.positionEntityScope).values(entities.map((entityCode) => ({ positionId: pos!.id, entityCode })));
    }
    await tx.insert(schema.auditLog).values({
      actorUserId: admin.id,
      action: "position.create",
      subjectType: "position",
      subjectId: pos!.id,
      after: { ...input, entities, actingUserId },
    });
  });

  revalidatePath("/admin/positions");
  return { ok: true, message: `Posisi ${input.title} dibuat${actingUserId ? " dengan pjs" : " (kosong)"}.` };
}

const ActingSchema = z.object({ positionId: z.string().uuid(), actingUserId: z.string().optional() });

/** Assigns or clears the pjs of a vacant position. A held position has no pjs. */
export async function setActing(_prev: PositionState, form: FormData): Promise<PositionState> {
  const admin = await requireOrgAdmin();
  if (!admin) return { ok: false, message: "Hanya Admin yang dapat mengelola posisi." };

  const parsed = ActingSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const actingUserId = parsed.data.actingUserId || null;

  const [pos] = await db.select().from(schema.position).where(eq(schema.position.id, parsed.data.positionId));
  if (!pos) return { ok: false, message: "Posisi tidak ditemukan." };
  if (pos.holderUserId) return { ok: false, message: "Posisi ini terisi; pjs hanya untuk posisi kosong." };
  if (actingUserId) {
    const [u] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, actingUserId));
    if (!u) return { ok: false, message: "Pengguna pjs tidak ditemukan." };
  }

  await db.transaction(async (tx) => {
    await tx.update(schema.position).set({ actingUserId }).where(eq(schema.position.id, pos.id));
    await tx.insert(schema.auditLog).values({
      actorUserId: admin.id,
      action: actingUserId ? "position.assign_acting" : "position.clear_acting",
      subjectType: "position",
      subjectId: pos.id,
      before: { actingUserId: pos.actingUserId },
      after: { actingUserId },
    });
  });

  revalidatePath("/admin/positions");
  return { ok: true, message: actingUserId ? "pjs ditetapkan." : "pjs dicabut; posisi kosong." };
}

const UpdateSchema = z.object({
  positionId: z.string().uuid(),
  orgUnit: z.string().min(1, "Pilih unit"),
  title: z.string().trim().min(2, "Jabatan wajib diisi"),
  role: z.enum(ROLES),
  holderUserId: z.string().optional(),
  holderName: z.string().trim().max(120).optional(),
});

/** Edits a position's unit, title, role, entities and (optionally) holder. */
export async function updatePosition(_prev: PositionState, form: FormData): Promise<PositionState> {
  const admin = await requireOrgAdmin();
  if (!admin) return { ok: false, message: "Hanya Admin yang dapat mengelola posisi." };

  const parsed = UpdateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Periksa isian.", errors: z.flattenError(parsed.error).fieldErrors };
  const input = parsed.data;
  const entities = entityList(form);
  if (!entities.length) return { ok: false, message: "Pilih minimal satu entitas.", errors: { entities: ["Pilih minimal satu entitas"] } };
  const hasHolderField = form.has("holderUserId");
  const holderUserId = input.holderUserId || null;

  const [pos] = await db.select().from(schema.position).where(eq(schema.position.id, input.positionId));
  if (!pos) return { ok: false, message: "Posisi tidak ditemukan." };
  const [unit] = await db.select().from(schema.orgUnit).where(eq(schema.orgUnit.code, input.orgUnit));
  if (!unit) return { ok: false, message: "Unit tidak dikenal." };
  if (hasHolderField && holderUserId) {
    const [u] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.id, holderUserId));
    if (!u) return { ok: false, message: "Pemegang tidak ditemukan." };
  }

  const before = await db
    .select({ e: schema.positionEntityScope.entityCode })
    .from(schema.positionEntityScope)
    .where(eq(schema.positionEntityScope.positionId, pos.id));

  await db.transaction(async (tx) => {
    const nextHolder = hasHolderField ? holderUserId : pos.holderUserId;
    await tx
      .update(schema.position)
      .set({
        orgUnitCode: input.orgUnit,
        title: input.title,
        role: input.role,
        holderUserId: nextHolder,
        // The document's name only stands in until an account holds the seat.
        holderName: nextHolder ? null : form.has("holderName") ? input.holderName || null : pos.holderName,
        // A held position has no pjs.
        actingUserId: nextHolder ? null : pos.actingUserId,
      })
      .where(eq(schema.position.id, pos.id));
    await tx.delete(schema.positionEntityScope).where(eq(schema.positionEntityScope.positionId, pos.id));
    await tx.insert(schema.positionEntityScope).values(entities.map((entityCode) => ({ positionId: pos.id, entityCode })));
    await tx.insert(schema.auditLog).values({
      actorUserId: admin.id,
      action: "position.update",
      subjectType: "position",
      subjectId: pos.id,
      before: { orgUnit: pos.orgUnitCode, title: pos.title, role: pos.role, holderUserId: pos.holderUserId, holderName: pos.holderName, entities: before.map((b) => b.e) },
      after: { orgUnit: input.orgUnit, title: input.title, role: input.role, holderUserId: hasHolderField ? holderUserId : pos.holderUserId, holderName: input.holderName ?? null, entities },
    });
  });

  revalidatePath("/admin/positions");
  revalidatePath("/admin/users");
  return { ok: true, message: "Posisi disimpan." };
}
