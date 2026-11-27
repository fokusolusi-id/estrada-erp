"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { COMPLIANCE_STATUSES, can, complianceProblem } from "@estrada/domain";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const Input = z.object({ code: z.string().max(40), status: z.enum(COMPLIANCE_STATUSES), evidenceUrl: z.string().trim().max(500), note: z.string().trim().max(1000) });

/** Records a checklist row's status, evidence link and note, with an audit entry. */
export async function saveCompliance(input: z.input<typeof Input>): Promise<Result> {
  const user = await requireUser();
  if (!can(user.actor, "compliance.manage", null, await loadOrg())) return { ok: false, message: "Status kepatuhan diubah oleh Head FRM atau Auditor." };
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Periksa isian." };
  const v = parsed.data;
  const problem = complianceProblem(v);
  if (problem) return { ok: false, message: problem === "link" ? "Tautan bukti harus alamat web (https://…)." : "Baris tidak dikenal." };
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.complianceRecord).where(eq(schema.complianceRecord.code, v.code));
    const record = { code: v.code, status: v.status, evidenceUrl: v.evidenceUrl || null, note: v.note || null, updatedBy: user.id, updatedAt: new Date() };
    await tx.insert(schema.complianceRecord).values(record).onConflictDoUpdate({ target: schema.complianceRecord.code, set: record });
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "compliance.update", subjectType: "compliance_record", subjectId: v.code, before: before ?? null, after: record });
  });
  revalidatePath("/kepatuhan");
  return { ok: true, message: "Disimpan." };
}
