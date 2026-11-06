"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@estrada/db";
import { ALLOCATION_BASES, ALLOCATION_PROBLEM_LABEL, can, fixedProblem } from "@estrada/domain";
import { openVersion } from "@/lib/rka";
import { requireUser } from "@/lib/session";
import { loadOrg } from "@/lib/workflow";

type Result = { ok: boolean; message: string };

const Changes = z
  .array(
    z.object({
      id: z.string().uuid(),
      basis: z.enum(ALLOCATION_BASES).nullable(),
      fixed: z.record(z.string(), z.string().max(20)).nullable(),
    }),
  )
  .min(1)
  .max(1000);

async function activeEntities() {
  const rows = await db.select({ code: schema.companyEntity.code }).from(schema.companyEntity).where(eq(schema.companyEntity.active, true));
  return rows.map((r) => r.code);
}

/** Marks lines as shared costs (or not) with their basis; every line is checked in the domain before anything is written. */
export async function saveSharedCosts(input: z.input<typeof Changes>): Promise<Result> {
  const user = await requireUser();
  const parsed = Changes.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Permintaan tidak valid." };
  const changes = parsed.data;

  const [org, entities, rows] = await Promise.all([
    loadOrg(),
    activeEntities(),
    db.select().from(schema.budgetLine).where(inArray(schema.budgetLine.id, changes.map((c) => c.id))),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const allowed = changes.every((c) => {
    const l = byId.get(c.id);
    return !!l && can(user.actor, "allocation.manage", { requestorUnit: l.requestorUnit, ownerUnit: l.ownerUnit, entity: l.entityCode, state: l.state }, org);
  });
  if (!allowed) return { ok: false, message: "Anda tidak berwenang mengatur biaya bersama untuk sebagian baris ini." };
  for (const c of changes) {
    const problem = c.basis === "fixed" ? fixedProblem(c.fixed ?? {}, entities) : null;
    if (problem) return { ok: false, message: ALLOCATION_PROBLEM_LABEL[problem] };
  }

  await db.transaction(async (tx) => {
    for (const c of changes) {
      const before = byId.get(c.id)!;
      const after = { sharedBasis: c.basis, sharedFixed: c.basis === "fixed" ? c.fixed : null };
      await tx.update(schema.budgetLine).set({ ...after, updatedAt: new Date() }).where(eq(schema.budgetLine.id, c.id));
      await tx.insert(schema.auditLog).values({
        actorUserId: user.id,
        action: "line.shared",
        subjectType: "budget_line",
        subjectId: c.id,
        before: { sharedBasis: before.sharedBasis, sharedFixed: before.sharedFixed },
        after,
      });
    }
  });
  revalidatePath("/rka/allocation");
  revalidatePath("/summary");
  return { ok: true, message: `${changes.length} baris disimpan.` };
}

const Heads = z.record(z.string(), z.number().int().min(0).max(1_000_000));

/** The head count per entity for the open version: the headcount basis. Finance runs the cycle, so it sets it. */
export async function saveEntityHeadcount(input: Record<string, number>): Promise<Result> {
  const user = await requireUser();
  const org = await loadOrg();
  if (!can(user.actor, "cycle.manage", null, org)) return { ok: false, message: "Hanya Finance yang dapat mengisi headcount." };
  const parsed = Heads.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Headcount harus bilangan bulat 0 atau lebih." };
  const version = await openVersion();
  if (!version) return { ok: false, message: "Belum ada siklus RKA yang dibuka." };
  const entities = await activeEntities();
  if (Object.keys(parsed.data).some((e) => !entities.includes(e))) return { ok: false, message: "Entitas tidak dikenal." };

  await db.transaction(async (tx) => {
    const before = await tx.select().from(schema.entityHeadcount).where(eq(schema.entityHeadcount.versionId, version.id));
    await tx.delete(schema.entityHeadcount).where(eq(schema.entityHeadcount.versionId, version.id));
    const rows = Object.entries(parsed.data).map(([entityCode, heads]) => ({ versionId: version.id, entityCode, heads }));
    if (rows.length) await tx.insert(schema.entityHeadcount).values(rows);
    await tx.insert(schema.auditLog).values({
      actorUserId: user.id,
      action: "version.headcount",
      subjectType: "budget_version",
      subjectId: version.id,
      before: Object.fromEntries(before.map((h) => [h.entityCode, h.heads])),
      after: parsed.data,
    });
  });
  revalidatePath("/rka/allocation");
  revalidatePath("/summary");
  return { ok: true, message: "Headcount disimpan." };
}
