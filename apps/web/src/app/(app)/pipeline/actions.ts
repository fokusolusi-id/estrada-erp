"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { DEAL_STATUSES, DEAL_TYPES, SEGMENTS, canPipeline, canRecoveryPlan, dealProblems, duplicateProject, needsRecovery, pipelineBySegment, type TerminInput } from "@estrada/domain";
import { loadPipeline, pipelineYear } from "@/lib/pipeline";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const hasProject = async (dealId: string) => (await db.select({ id: schema.project.id }).from(schema.project).where(eq(schema.project.dealId, dealId))).length > 0;

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
  leadTimeMonths: z.number().nullable().optional(),
  termins: z
    .array(z.object({ amount: z.string().regex(/^\d+(\.\d{1,2})?$/), plannedDate: z.string().max(10), description: z.string().max(200).nullable().optional() }))
    .max(60)
    .optional(),
});

/** Adds or updates a deal; BCD only, within its entities, checked again for the deal's current entity. */
export async function saveDeal(input: Omit<z.input<typeof Deal>, "termins"> & { termins?: readonly TerminInput[] }): Promise<Result> {
  const user = await requireUser();
  const parsed = Deal.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Data deal tidak valid." };
  const { id, ...deal } = parsed.data;
  if (dealProblems(deal).some((p) => p.blocking)) return { ok: false, message: "Lengkapi data deal terlebih dahulu." };

  const org = await loadOrg();
  if (!canPipeline(user.actor, "edit", deal.entity, org)) return { ok: false, message: "Anda tidak berwenang mengubah pipeline untuk entitas ini." };
  const year = await pipelineYear();
  if (!year) return { ok: false, message: "Belum ada siklus RKA." };
  const [coa] = await db.select().from(schema.coaAccount).where(eq(schema.coaAccount.code, deal.coaCode ?? ""));
  if (!coa || coa.category !== "Revenue" || !coa.active) return { ok: false, message: "COA harus akun pendapatan yang aktif di COA Master." };
  // The project name becomes the Kode Proyek, so it is unique per fiscal year and entity.
  const others = await db
    .select({ entity: schema.pipelineDeal.entityCode, project: schema.pipelineDeal.project })
    .from(schema.pipelineDeal)
    .where(and(eq(schema.pipelineDeal.fiscalYear, year), eq(schema.pipelineDeal.entityCode, deal.entity), id ? ne(schema.pipelineDeal.id, id) : undefined));
  if (duplicateProject(deal, others)) return { ok: false, message: "Nama project sudah dipakai deal lain di entitas dan tahun ini." };

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
    leadTimeMonths: deal.leadTimeMonths ?? null,
  };
  const termins = (deal.termins ?? []).map((t, i) => ({ no: i + 1, description: t.description?.trim() || null, amount: t.amount, plannedOn: t.plannedDate }));
  const [before] = id ? await db.select().from(schema.pipelineDeal).where(eq(schema.pipelineDeal.id, id)) : [];
  if (id && (!before || !canPipeline(user.actor, "edit", before.entityCode, org))) return { ok: false, message: "Anda tidak berwenang mengubah deal ini." };
  // A deal with a project is a signed contract in delivery: it stays Closed Won.
  if (id && deal.status !== "CW" && (await hasProject(id))) return { ok: false, message: "Deal ini sudah memiliki proyek di Implementasi; statusnya tetap Closed Won." };
  await db.transaction(async (tx) => {
    let dealId = id;
    if (id) {
      const beforeTermins = await tx.select().from(schema.billingTermin).where(eq(schema.billingTermin.dealId, id));
      await tx.update(schema.pipelineDeal).set({ ...values, updatedAt: new Date() }).where(eq(schema.pipelineDeal.id, id));
      await tx.delete(schema.billingTermin).where(eq(schema.billingTermin.dealId, id));
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "pipeline.update", subjectType: "pipeline_deal", subjectId: id, before: { ...before, termins: beforeTermins }, after: { ...values, termins } });
    } else {
      const [row] = await tx.insert(schema.pipelineDeal).values({ ...values, fiscalYear: year, createdBy: user.id }).returning({ id: schema.pipelineDeal.id });
      dealId = row!.id;
      await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "pipeline.create", subjectType: "pipeline_deal", subjectId: dealId, after: { ...values, termins } });
    }
    // Billing Termin is the only source of the invoice plan: replaced whole with the deal.
    if (termins.length) await tx.insert(schema.billingTermin).values(termins.map((t) => ({ ...t, dealId: dealId! })));
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
  if (await hasProject(id)) return { ok: false, message: "Deal ini sudah memiliki proyek di Implementasi dan tidak dapat dihapus." };
  await db.transaction(async (tx) => {
    await tx.delete(schema.pipelineDeal).where(eq(schema.pipelineDeal.id, id));
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "pipeline.delete", subjectType: "pipeline_deal", subjectId: id, before });
  });
  revalidatePath("/pipeline");
  revalidatePath("/summary");
  return { ok: true, message: "Deal dihapus." };
}

/** The Sales Head's written recovery plan for a segment whose weighted coverage is below 1,0x. */
export async function saveRecoveryPlan(segment: string, plan: string): Promise<Result> {
  const user = await requireUser();
  const text = z.string().trim().min(10).max(2000).safeParse(plan);
  if (!(SEGMENTS as readonly string[]).includes(segment) || !text.success) return { ok: false, message: "Tulis rencana pemulihan, minimal 10 karakter." };
  const org = await loadOrg();
  if (!canRecoveryPlan(user.actor, org)) return { ok: false, message: "Rencana pemulihan ditulis oleh Sales Head (Division Owner BCD)." };
  const year = await pipelineYear();
  if (!year) return { ok: false, message: "Belum ada siklus RKA." };
  const { deals, targets } = await loadPipeline(year);
  const row = pipelineBySegment(deals, targets).find((r) => r.segment === segment);
  if (!row || !needsRecovery(row)) return { ok: false, message: "Coverage segmen ini sudah 1,0x atau lebih." };

  const key = and(eq(schema.pipelineRecoveryPlan.fiscalYear, year), eq(schema.pipelineRecoveryPlan.segment, segment));
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.pipelineRecoveryPlan).where(key);
    const values = { plan: text.data, updatedBy: user.id, updatedAt: new Date() };
    await tx
      .insert(schema.pipelineRecoveryPlan)
      .values({ fiscalYear: year, segment, ...values })
      .onConflictDoUpdate({ target: [schema.pipelineRecoveryPlan.fiscalYear, schema.pipelineRecoveryPlan.segment], set: values });
    await tx.insert(schema.auditLog).values({ actorUserId: user.id, action: "pipeline.recovery_plan", subjectType: "pipeline_segment", subjectId: `${year}:${segment}`, before: before ?? null, after: { plan: text.data } });
  });
  revalidatePath("/pipeline");
  return { ok: true, message: "Rencana pemulihan disimpan." };
}
