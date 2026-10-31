"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { ROLES, can } from "@estrada/domain";
import { requireUser } from "@/lib/session";
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
  entities: z.string().default("ESTRADA"),
  actingUserId: z.string().optional(),
});

/** Creates a position, vacant unless a pjs is named. Vacant heads are filled by a pjs, never by escalation. */
export async function createPosition(_prev: PositionState, form: FormData): Promise<PositionState> {
  const admin = await requireOrgAdmin();
  if (!admin) return { ok: false, message: "Hanya Admin yang dapat mengelola posisi." };

  const parsed = CreateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Periksa isian.", errors: z.flattenError(parsed.error).fieldErrors };
  const input = parsed.data;
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
    const entities = input.entities.split(",").map((e) => e.trim()).filter(Boolean);
    if (entities.length) {
      await tx.insert(schema.positionEntityScope).values(entities.map((entityCode) => ({ positionId: pos!.id, entityCode })));
    }
    await tx.insert(schema.auditLog).values({
      actorUserId: admin.id,
      action: "position.create",
      subjectType: "position",
      subjectId: pos!.id,
      after: { ...input, actingUserId },
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
