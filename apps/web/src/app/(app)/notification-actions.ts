"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { requireUser } from "@/lib/session";

/** Marks one of the signed-in user's notifications read, or all of them when no id is given. */
export async function markNotificationsRead(id?: string): Promise<void> {
  const user = await requireUser();
  const one = z.string().uuid().optional().safeParse(id);
  if (!one.success) return;
  await db
    .update(schema.notification)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notification.userId, user.id), isNull(schema.notification.readAt), one.data ? eq(schema.notification.id, one.data) : undefined));
  revalidatePath("/", "layout");
}
