"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { auth } from "@/lib/auth";
import { requireUser, VIEW_AS_COOKIE } from "@/lib/session";

/** Switches the position this session acts in. Only positions the user holds or acts in (pjs) are allowed. */
export async function switchPosition(positionId: string): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (!user.positions.some((p) => p.id === positionId)) return { ok: false };
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false };

  await db.update(schema.session).set({ activePositionId: positionId }).where(eq(schema.session.id, session.session.id));
  await db.insert(schema.auditLog).values({
    actorUserId: user.id,
    action: "position.switch",
    subjectType: "position",
    subjectId: positionId,
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Admin only: act as a seat of another role (null returns to Admin). Audited; the signed-in user stays the actor of record. */
export async function actAs(positionId: string | null): Promise<{ ok: boolean }> {
  const user = await requireUser();
  if (user.realRole !== "admin" || !user.viewAs) return { ok: false };
  if (positionId && !user.viewAs.options.some((o) => o.id === positionId)) return { ok: false };
  const jar = await cookies();
  if (positionId) jar.set(VIEW_AS_COOKIE, positionId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
  else jar.delete(VIEW_AS_COOKIE);
  await db.insert(schema.auditLog).values({
    actorUserId: user.id,
    action: "admin.act_as",
    subjectType: "position",
    subjectId: positionId ?? "self",
  });
  revalidatePath("/", "layout");
  return { ok: true };
}
