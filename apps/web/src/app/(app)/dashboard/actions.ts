"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { canEditHighlight } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

const Form = z.object({ scope: z.string().min(1).max(200), year: z.coerce.number().int().min(2000).max(2100), month: z.coerce.number().int().min(1).max(12), body: z.string().trim().max(4000) });

/** The month's highlights for the companies on screen; every change keeps the earlier text in the audit log. */
export async function saveHighlight(form: FormData): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  const parsed = Form.safeParse(Object.fromEntries(Object.keys(Form.shape).map((k) => [k, String(form.get(k) ?? "")])));
  if (!parsed.success) return { ok: false, message: "Periksa isian." };
  const v = parsed.data;
  if (!canEditHighlight(user.actor, v.scope.split("+"), await loadOrg())) return { ok: false, message: "Highlight ditulis Direktur atau Head FRM untuk perusahaannya." };
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(schema.bodHighlight)
      .where(and(eq(schema.bodHighlight.scope, v.scope), eq(schema.bodHighlight.year, v.year), eq(schema.bodHighlight.month, v.month)))
      .limit(1)
      .for("update");
    const [row] = await tx
      .insert(schema.bodHighlight)
      .values({ ...v, updatedBy: user.id })
      .onConflictDoUpdate({ target: [schema.bodHighlight.scope, schema.bodHighlight.year, schema.bodHighlight.month], set: { body: v.body, updatedBy: user.id, updatedAt: new Date() } })
      .returning({ id: schema.bodHighlight.id });
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "bod.highlight", subjectType: "bod_highlight", subjectId: row?.id ?? v.scope, before: before ? { body: before.body } : null, after: v });
  });
  revalidatePath("/dashboard");
  return { ok: true, message: "Highlight disimpan." };
}
