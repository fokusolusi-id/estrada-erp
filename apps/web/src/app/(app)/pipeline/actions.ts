"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { DEAL_STATUSES, DEAL_TYPES, canPipeline, dealProblems } from "@estrada/domain";
import { pipelineYear } from "@/lib/pipeline";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const Deal = z.object({
  id: z.string().uuid().nullable(),
  entity: z.string().min(1).max(20),
  customer: z.string().max(200),
  endCustomer: z.string().max(200).nullable().optional(),
  segment: z.string().max(100),
  project: z.string().max(500),
  coaCode: z.string().max(20).nullable(),
  value: z.string().regex(/^\d+(\.\d{1,2})?$/),
  status: z.enum(DEAL_STATUSES),
  probability: z.string().regex(/^\d{1,3}(\.\d{1,2})?$/),
  type: z.enum(DEAL_TYPES),
  startMonth: z.number().int(),
  endMonth: z.number().int(),
  notes: z.string().max(1000).nullable().optional(),
});

/** Adds or updates a deal; BCD only, within its entities, checked again for the deal's current entity. */
export async function saveDeal(input: z.input<typeof Deal>): Promise<Result> {
  const user = await requireUser();
  const parsed = Deal.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Data deal tidak valid." };
  const { id, ...deal } = parsed.data;
  if (dealProblems(deal).some((p) => p.blocking)) return { ok: false, message: "Lengkapi data deal terlebih dahulu." };

  const org = await loadOrg();
  if (!canPipeline(user.actor, "edit", deal.entity, org)) return { ok: false, message: "Anda tidak berwenang mengubah pipeline untuk entitas ini." };
  const year = await pipelineYear();
  if (!year) return { ok: false, message: "Belum ada siklus RKA." };
  if (deal.coaCode) {
    const [coa] = await db.select().from(schema.coaAccount).where(eq(schema.coaAccount.code, deal.coaCode));
    if (!coa || coa.category !== "Revenue") return { ok: false, message: "COA harus akun pendapatan." };
  }

  const values = {
    entityCode: deal.entity,
    customer: deal.customer.trim(),
    endCustomer: deal.endCustomer?.trim() || null,
    segment: deal.segment,
    project: deal.project.trim(),
    coaCode: deal.coaCode,
    value: deal.value,
    status: deal.status,
    probability: deal.probability,
    type: deal.type,
    startMonth: deal.startMonth,
    endMonth: deal.endMonth,
    notes: deal.notes?.trim() || null,
  };
  const [before] = id ? await db.select().from(schema.pipelineDeal).where(eq(schema.pipelineDeal.id, id)) : [];
  if (id && (!before || !canPipeline(user.actor, "edit", before.entityCode, org))) return { ok: false, message: "Anda tidak berwenang mengubah deal ini." };
  await db.transaction(async (tx) => {
    if (id) {
      await tx.update(schema.pipelineDeal).set({ ...values, updatedAt: new Date() }).where(eq(schema.pipelineDeal.id, id));
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "pipeline.update", subjectType: "pipeline_deal", subjectId: id, before, after: values });
    } else {
      const [row] = await tx.insert(schema.pipelineDeal).values({ ...values, fiscalYear: year, createdBy: user.id }).returning({ id: schema.pipelineDeal.id });
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "pipeline.create", subjectType: "pipeline_deal", subjectId: row!.id, after: values });
    }
  });
  revalidatePath("/pipeline");
  revalidatePath("/summary");
  return { ok: true, message: "Deal disimpan." };
}

export async function deleteDeal(id: string): Promise<Result> {
  const user = await requireUser();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, message: "Permintaan tidak valid." };
  const org = await loadOrg();
  const [before] = await db.select().from(schema.pipelineDeal).where(eq(schema.pipelineDeal.id, id));
  if (!before || !canPipeline(user.actor, "edit", before.entityCode, org)) return { ok: false, message: "Anda tidak berwenang menghapus deal ini." };
  await db.transaction(async (tx) => {
    await tx.delete(schema.pipelineDeal).where(eq(schema.pipelineDeal.id, id));
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "pipeline.delete", subjectType: "pipeline_deal", subjectId: id, before });
  });
  revalidatePath("/pipeline");
  revalidatePath("/summary");
  return { ok: true, message: "Deal dihapus." };
}
