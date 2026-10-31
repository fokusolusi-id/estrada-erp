"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { ROLES } from "@estrada/domain";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";

const InviteSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter"),
  email: z.string().trim().toLowerCase().email("Email tidak valid"),
  title: z.string().trim().min(2, "Jabatan wajib diisi"),
  orgUnit: z.string().min(1, "Pilih unit"),
  role: z.enum(ROLES),
  entities: z.string().default("ESTRADA"),
});

export type InviteState = { ok: boolean; message: string; errors?: Record<string, string[]> };

/** Admin creates the user and position, then the invitation email (a set-password link) is sent. */
export async function inviteUser(_prev: InviteState, form: FormData): Promise<InviteState> {
  const admin = await requireUser();
  if (admin.actor.role !== "admin") return { ok: false, message: "Hanya Admin yang dapat mengundang pengguna." };

  const parsed = InviteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: "Periksa isian.", errors: z.flattenError(parsed.error).fieldErrors };
  const input = parsed.data;

  const [existing] = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, input.email));
  if (existing) return { ok: false, message: "Email sudah terdaftar." };

  const userId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(schema.user).values({ id: userId, name: input.name, email: input.email });
    const [pos] = await tx
      .insert(schema.position)
      .values({ orgUnitCode: input.orgUnit, title: input.title, role: input.role, holderUserId: userId })
      .returning({ id: schema.position.id });
    const entities = input.entities.split(",").map((e) => e.trim()).filter(Boolean);
    if (pos && entities.length) {
      await tx.insert(schema.positionEntityScope).values(entities.map((entityCode) => ({ positionId: pos.id, entityCode })));
    }
    await tx.insert(schema.auditLog).values({
      actorUserId: admin.id,
      action: "user.invite",
      subjectType: "user",
      subjectId: userId,
      after: { email: input.email, role: input.role, orgUnit: input.orgUnit },
    });
  });

  // No credential account yet, so the auth email hook sends the "invitation" template.
  await auth.api.requestPasswordReset({ body: { email: input.email, redirectTo: "/set-password" } });

  revalidatePath("/admin/users");
  return { ok: true, message: `Undangan dikirim ke ${input.email}.` };
}
