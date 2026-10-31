"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@estrada/db";
import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";

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
