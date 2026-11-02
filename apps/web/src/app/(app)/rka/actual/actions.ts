"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { can, money } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

const Changes = z
  .array(z.object({ id: z.string().uuid(), actual: z.string().regex(/^-?\d+(\.\d{1,2})?$/).nullable() }))
  .min(1)
  .max(1000);

/** Saves Finance's 2026 actuals in one go; every line is checked in the domain before anything is written. */
export async function saveActuals(input: { id: string; actual: string | null }[]): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  const parsed = Changes.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Nominal tidak valid." };
  const changes = parsed.data;

  const org = await loadOrg();
  const rows = await db.select().from(schema.budgetLine).where(inArray(schema.budgetLine.id, changes.map((c) => c.id)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const allowed = changes.every((c) => {
    const l = byId.get(c.id);
    return !!l && can(user.actor, "actual.edit", { requestorUnit: l.requestorUnit, ownerUnit: l.ownerUnit, entity: l.entityCode, state: l.state }, org);
  });
  if (!allowed) return { ok: false, message: "Anda tidak berwenang mengisi realisasi untuk sebagian baris ini." };

  await db.transaction(async (tx) => {
    for (const c of changes) {
      const before = byId.get(c.id)!.actual2026;
      const after = c.actual === null ? null : money(c.actual).toFixed(2);
      await tx.update(schema.budgetLine).set({ actual2026: after, updatedAt: new Date() }).where(eq(schema.budgetLine.id, c.id));
      await tx.insert(schema.auditLog).values({
        actorUserId: user.id,
        action: "line.actual",
        subjectType: "budget_line",
        subjectId: c.id,
        before: { actual2026: before },
        after: { actual2026: after },
      });
    }
  });
  revalidatePath("/rka", "layout");
  return { ok: true, message: `${changes.length} baris disimpan.` };
}
